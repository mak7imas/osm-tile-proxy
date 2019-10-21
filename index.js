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
}

var download = function (url, dest, pipe, cb) {
  var file = fs.createWriteStream(dest);
  var request = http.get(url, function (response) {
    if (pipe)
      response.pipe(pipe);
    response.pipe(file);
    file.on('finish', function () {
      file.close(cb);
    });
  }).on('error', function (err) {
    fs.unlink(dest);
    if (cb) cb(err.message);
  });
};

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

      const origin = atmp[1];
      const subdir = atmp[2];
      const filepath = atmp[3];
      //console.log(atmp);

      let file = path.join(workdir, subdir, filepath);
      let contentType = mime.lookup(file);
      let cacheControl = conf.cacheControl;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method'] || '');
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '');
      res.setHeader('Cache-Control', cacheControl);
      res.setHeader('Content-Type', contentType);

      if (fs.existsSync(file)) {
        console.log('from cache: ', file);
        var stream = fs.createReadStream(file);
        stream.on('error', function (err) {
          throw err;
        });
        stream.pipe(res);
      } else {
        // download file, pipe to client and save to cache

        fs.mkdirSync(path.dirname(file), { recursive: true })
        console.log('caching:', file);
        download(query.url, file, res, function (err) {
          if (err) throw new Error(err);
        });
      }
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