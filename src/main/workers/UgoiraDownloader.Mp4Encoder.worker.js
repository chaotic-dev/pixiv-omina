import fs from 'fs-extra';
import Zip from 'jszip';
import FFmpeg from '@ffmpeg/ffmpeg';

class UgoiraDownloaderMp4EncoderWorker {
  constructor({ file, saveFile }) {
    this.init({ file, saveFile });
  }

  static run({ file, saveFile }) {
    let worker = new UgoiraDownloaderMp4EncoderWorker({ file, saveFile });
    return worker;
  }

  init({ file, saveFile }) {
    this.file = file;

    this.saveFile = saveFile;

    this.zipObj;

    this.frames;

    this.frameIndex = 0;

    this.abortSign = false;

    /**
     * @type {any} FFmpeg
     */
    this.ffmpeg = FFmpeg.createFFmpeg();

    return this;
  }

  abort() {
    this.abortSign = true;
  }

  prepare() {
    return fs.readFile(this.file).then(buffer => {
      return Zip.loadAsync(buffer);
    }).then(zipObj => {
      this.zipObj = zipObj;

      return this.zipObj.file('animation.json').async('string');
    }).then(content => {
      this.frames = JSON.parse(content);

      return this.zipObj.file('inputs.txt').async('string');
    }).then(content => {
      this.ffmpeg.FS('writeFile', 'inputs.txt', content)
      return this.addFrame();
    }).then(() => {
      return this.ffmpeg.load();
    });
  }

  encode() {

    (async () => {
      await this.ffmpeg.run('-f', 'concat', '-i', 'inputs.txt', '-vsync', 'vfr', '-pix_fmt', 'yuv420p', "output.mp4");
      await fs.promises.writeFile(this.saveFile, ffmpeg.FS('readFile', 'output.mp4'));
      this.frames.forEach((frame, i) => {
        this.ffmpeg.FS('unlink', frame.file);
      });
      this.ffmpeg.FS('unlink', "inputs.txt");
      this.ffmpeg.FS('unlink', "output.mp4");

      process.send({status: 'finish'});
    })();

  }

  addFrame() {
    return new Promise((resolve, reject) => {
      if (this.abortSign) {
        this.abortSign = false;
        reject(Error('aborted'));
        return;
      }

      const frame = this.frames[this.frameIndex];

      if (!frame) {
        resolve();
        return;
      }

      this.zipObj.file(frame.file).async('nodebuffer').then(buffer => {
        try {
          this.ffmpeg.FS('writeFile', frame.file, buffer)

          this.frameIndex++;

          resolve(this.addFrame(this.frameIndex));
        } catch (e) {
          process.send({
            status: 'error',
            message: e.message
          });
        }
      });
    });
  }
}

/**
 * @var {UgoiraDownloaderMp4EncoderWorker}
 */
let worker;

process.on('message', data => {
  if (data.action) {
    if (data.action === 'abort') {
      worker && worker.abort();
    }
  } else {
    if (worker) {
      worker.init({
        file: data.file,
        saveFile: data.saveFile
      });
    } else {
      worker = UgoiraDownloaderMp4EncoderWorker.run({
        file: data.file,
        saveFile: data.saveFile
      });
    }

    worker.prepare().then(() => {
      worker.encode();
    }).catch(error => {
      if (error.message === 'aborted') {
        process.send({
          status: 'abort'
        });
      } else {
        process.send({
          status: 'error',
          message: error.message
        });
      }
    });
  }
});
