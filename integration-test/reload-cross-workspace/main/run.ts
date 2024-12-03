import http from "http";
import { message } from "side/run-scratch";

const requestListener = function (req, res) {
  res.writeHead(200);
  res.end(message);
};

const server = http.createServer(requestListener);
server.listen(8080);
console.warn("Listening on 8080");
