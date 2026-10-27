/** Presentation frames around untouched actual captures; never invents gameplay. */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.FONTCONFIG_FILE = resolve(".cache/submission/fonts.conf");
const dir = resolve("submission/screenshots"), out = resolve(dir,"gallery");
await mkdir(out,{recursive:true});
const esc = s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]);
const shell = (title,subtitle)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#07182E"/><path d="M88 55H150" stroke="#E9B96A" stroke-width="2"/><text x="88" y="115" fill="#DAF0EF" font-family="Readex Pro" font-size="39">${esc(title)}</text><text x="88" y="154" fill="#8DB5C3" font-family="IBM Plex Mono" font-size="15">${esc(subtitle)}</text><text x="88" y="983" fill="#8DB5C3" font-family="IBM Plex Mono" font-size="15">KHAYAL / ACTUAL CAPTURES, PRESENTED IN AN EDITORIAL FRAME / 28 OCT 2026</text></svg>`);
const items = [
  ["01-real-twitch-camera.png","01-real-twitch-camera.png","Your shadow. A real Twitch command.","ACTUAL CAMERA + TWITCH / AGENT-OPERATED BROADCASTER TEST"],
  ["02-real-hunt.png","02-real-hunt.png","Guard the five lanterns.","ACTUAL 60-SECOND HUNT / ONE DETECTED HIT / ACCURACY STUDY STILL PENDING"],
  ["03-live-cue-book.jpg","03-cue-book.png","Behind the moon.","ACTUAL OPERATOR WINDOW / CONNECTED TWITCH + LOCAL CAMERA"],
  ["04-real-playbill.png","04-playbill.png","The performance remembers its cast.","ACTUAL EXPORTED PLAYBILL / ONE BROADCASTER TEST CAST MEMBER"],
];
const manifest = [];
for (const [input,name,title,subtitle] of items) {
  const picture = await sharp(resolve(dir,input)).resize(1360,752,{fit:"inside",withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
  await sharp(shell(title,subtitle)).composite([{input:picture.data,left:Math.round((1536-picture.info.width)/2),top:Math.round(180+(752-picture.info.height)/2)}]).png().toFile(resolve(out,name));
  manifest.push({file:"submission/screenshots/gallery/"+name,original:"submission/screenshots/"+input,type:"presentation frame around actual capture",source:"broadcaster Twitch test; no human-viewer participation claim"});
}
// Crop only the real chat panel; keep its original screenshot privately alongside.
const chat = await sharp(resolve("docs/browser-evidence/twitch-chat-test.jpg")).extract({left:940,top:50,width:340,height:670}).resize(335,660).png().toBuffer();
const stage = await sharp(resolve(dir,"01-real-twitch-camera.png")).resize(1024,576).png().toBuffer();
await sharp(shell("From Twitch chat to the theatre.","ACTUAL TEST SESSION / COMMANDS SENT BY THE AGENT AS THE BROADCASTER"))
  .composite([{input:stage,left:88,top:256},{input:chat,left:1114,top:210}]).png().toFile(resolve(out,"05-twitch-command-proof.png"));
manifest.push({file:"submission/screenshots/gallery/05-twitch-command-proof.png",originals:["submission/screenshots/01-real-twitch-camera.png","docs/browser-evidence/twitch-chat-test.jpg"],type:"labeled comparison of actual stage and cropped actual chat; not one original screenshot",source:"authorized !cat, !closer, !jump, !afreet broadcaster tests"});
await writeFile(resolve("submission/gallery-manifest.json"),JSON.stringify({width:1536,height:1024,images:manifest,syntheticViewers:false,reviewRequired:true},null,2)+"\n");
console.log("Prepared five3:2 gallery presentation images from actual captures.");
