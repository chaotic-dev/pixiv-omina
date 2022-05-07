import path from 'path';
import fs from 'fs';
import { fork } from 'child_process';
import { app } from 'electron';
import { debug } from '@/global';
import BaseTask from './BaseTask';

/**
 * @class
 * @member {void} generateMp4
 */
class UgoiraConvertTask extends BaseTask {
  /**
   * @var {string}
   */
  static name = 'ugoira-convert-task'

  constructor() {
    super();

    /**
     * Stored generation params
     * @type {Array.<{file:string, saveFile:string}>}
     */
    this.taskSources = [];
    this.worker;
  }

  /**
   * @returns {String}
   */
  getName() {
    return UgoiraConvertTask.name;
  }

  /**
   * @inheritdoc
   * @returns {String}
   */
  getStatusMessage() {
    if (this.taskSources.length > 0) {
      return `Current: ${this.taskSources[0].file}`;
    } else {
      return `No task`;
    }
  }

  /**
   * @override
   */
  getJobsLeft() {
    return this.taskSources.length;
  }

  /**
   *
   * @param {{file: string, saveFile: string}} payload
   */
  addPayload(payload) {
    for (let i = 0; i < this.taskSources.length; i++) {
      if (this.taskSources[i].file === payload.file &&
        this.taskSources[i].saveFile === payload.saveFile
      ) {
        return this;
      }
    }

    this.taskSources.push(payload);
    this.updateProgress();
    return this;
  }

  start() {
    if ((this.status === UgoiraConvertTask.IDLE_STATUS || this.status === UgoiraConvertTask.PAUSE_STATUS) && this.taskSources.length > 0) {
      this.setStart();
      this.generateMp4(this.taskSources[0]);
    }
  }

  pause() {
    this.setPause();

    if (this.worker) {
      this.worker.send({
        action: 'abort'
      });
    }
  }

  stop() {
    this.pause();
  }

  /**
   *
   * @param {number} progress single generate task progress
   * @returns {void}
   */
  updateProgress(progress) {
    this.setProgress(progress);
  }

  generateNext() {
    /**
     * Prouise task is complete
     */
    this.updateProgress(1);
    this.taskSources.splice(0, 1);

    if (this.taskSources.length > 0) {
      /**
       * If the task is paused, the task status will be pausing or pause. Then the task shouldn't start
       * next job
       */
      if (this.getStatus() === UgoiraConvertTask.PROCESS_STATUS) {
        this.generateMp4(this.taskSources[0]);
      }
    } else {
      this.setFinish();
    }
  }

  generateMp4({file, saveFile}) {
    debug.sendStatus(`Generating MP4`);

    /**
     * Check if the mp4 file has been generated, if file has been generated then start generating next file
     */
    if (fs.existsSync(saveFile)) {
      debug.sendStatus(`MP4 has been generated, skip`);

      this.updateProgress(1);
      this.generateNext();
      return;
    }

    /**
     * Check if the worker has been created
     */
    if (!this.worker) {
      let workPath = path.join(app.getAppPath(), 'UgoiraDownloaderMp4EncoderWorker.js');

      if (fs.existsSync(workPath)) {
        this.worker = fork(workPath);
      } else {
        this.worker = fork(path.join(process.resourcesPath, 'app.asar', 'UgoiraDownloaderMp4EncoderWorker.js'));
      }

      this.worker.on('message', data => {
        if (data.status === 'error') {
          debug.sendStatus(data.message);
          this.updateProgress(0);
          this.generateNext();
        } else if (data.status === 'finish') {
          debug.sendStatus(`Generate MP4 complete`);

          this.updateProgress(1);
          this.generateNext();
        } else if (data.status === 'progress') {
          debug.sendStatus(`Generate MP4 progress ${data.progress}`);

          this.updateProgress(data.progress);
        } else if (data.status === 'abort') {
          this.updateProgress(0);
          this.setPause();
        }
      });
    }

    this.worker.send({
      file,
      saveFile
    });
  }
}

export default UgoiraConvertTask;
