import http from "http";

const requestListener = function (req, res) {
  res.writeHead(200);
  res.end("Hey, Pluto!");
};

const server = http.createServer(requestListener);
server.listen(8080);
console.warn("Listening on 8080");
