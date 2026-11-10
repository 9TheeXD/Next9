// Every port the NEXT9 web stack uses, all inside 8070–8099. Change them here only.
//
//   dev   (`npm run dev`)    open http://<host>:8070  — gateway -> Next.js dev on 8071
//   prod  (`npm start`)      open http://<host>:8092  — gateway -> Next.js production server on 8093
//   shared by both           legacy static pages on 8072, server.js API on 8089 (fixed in server.js)
//   taken on the VPS         8090 = LINE bot (lineBot/index.js, host network) — do not use
export const PORTS = {
  devGateway: 8070,
  devNext: 8071,
  legacyStatic: 8072,
  api: 8089,
  prodGateway: 8092,
  prodNext: 8093,
};
