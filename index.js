/*
 * Author(s): Maxim Andreev
 */

var fs = require('fs');
var url = require('url');
var http = require('http');
var path = require('path');
var mime = require('mime');

const conf = {
  port: 3005,
  workdir: path.join(__dirname, 'tilecache'),
  cacheControl: 'public, max-age=8640000',
  minSize: 200,
  maxCacheDays: 30,
}

function download(url, dest, pipe) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(dest);
    const options = {
      headers:  { 'User-Agent': 'Mozilla/5.0' }
    }
    const request = http.get(url, options, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Response status was ${response.statusCode} on url ${url}`));
      }
      if (pipe) response.pipe(pipe);
      response.pipe(stream);
    });
    stream.on('finish', () => stream.close(resolve));
    request.on('error', err => {
      fs.unlink(dest);
      return reject(err);
    });
    stream.on('error', err => {
      fs.unlink(dest);
      return reject(err);
    });
  });
}

function responseFile(url, file, res) {
  return new Promise((resolve, reject) => {
    let readFromCache;
    try {
      const stats = fs.statSync(file);
      const curtime = new Date();
      const timeDifference = Math.ceil(Math.abs(curtime.getTime() - stats.mtime.getTime()) / (1000 * 3600 * 24 * 60));
      readFromCache = stats.size > conf.minSize && timeDifference < conf.maxCacheDays
    } catch (e) {
      readFromCache = false;
    }
    if (readFromCache) {
      //console.log('from cache: ', file);
      const stream = fs.createReadStream(file);
      stream.on('error', err => {
        reject(err);
      });
      stream.pipe(res);
      stream.on('finish', () => stream.close(resolve));
    } else {
      // download file, pipe to client and save to cache
      fs.mkdirSync(path.dirname(file), { recursive: true })
      console.log('caching:', file);
      download(url, file, res)
        .then(() => resolve)
        .catch((err) => reject(err));
    }
  });
}

function main() {
  const workdir = conf.workdir;
  if (!fs.existsSync(workdir)) fs.mkdirSync(workdir);

  const proxy = http.createServer((req, res) => {

    try {
      if (req.url.indexOf('?') === -1)
        throw new Error("Can't find query");
      const query = url.parse(req.url, true).query;
      if (!query.url)
        throw new Error("Can't find query");

      let atmp = query.url.match(/([^:]+:\/+([^\/]+))\/(.*)/);

      const subdir = atmp[2];
      const filepath = atmp[3];
      //console.log(atmp);

      let file = path.join(workdir, subdir, filepath);
      let contentType = mime.getType(file);
      let cacheControl = conf.cacheControl;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method'] || '');
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '');
      res.setHeader('Cache-Control', cacheControl);
      res.setHeader('Content-Type', contentType);

      responseFile(query.url, file, res).then(() => {
        res.statusCode = 200;
        res.end();
      }).catch((e) => {
        //console.log("Error:", e.message);
        console.log(e.stack);
        res.statusCode = 500;
        res.statusMessage = e.message;
        res.end(e.message);
      })
    } catch (e) {
      console.log("Error: ", e.message);
      console.log(e.stack);
      res.statusCode = 500;
      res.statusMessage = e.message;
      res.end(e.message);
    }
  })
  proxy.listen(conf.port);
  console.log('Map-tile-proxy listening on port ' + conf.port);
}

main();