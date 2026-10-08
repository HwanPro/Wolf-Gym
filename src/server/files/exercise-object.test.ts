import {createHash} from "node:crypto";
import {afterEach,expect,it,vi} from "vitest";
import sharp from "sharp";
import {issueExerciseUploadProof,readExerciseUploadProof,validateExerciseObjectBytes} from "./exercise-object";
const claim=(body:Buffer,contentType="image/png",type:"image"|"video"="image")=>({ownerId:"owner",exerciseId:"exercise",fileKey:"exercises/images/fixture.png",type,contentType,fileSize:body.length,checksumSHA256:createHash("sha256").update(body).digest("base64")});
afterEach(()=>vi.unstubAllEnvs());
it("binds encrypted upload proof to its owner and exercise",async()=>{
 vi.stubEnv("NEXTAUTH_SECRET","synthetic-unit-proof-secret-32-characters");
 const value=claim(Buffer.from("fixture")),token=await issueExerciseUploadProof(value);
 expect(await readExerciseUploadProof(token,"owner","exercise")).toMatchObject(value);
 expect(await readExerciseUploadProof(token,"other","exercise")).toBeNull();
 expect(await readExerciseUploadProof(token,"owner","other")).toBeNull();
 expect(await readExerciseUploadProof(token+"tampered","owner","exercise")).toBeNull();
});
it("rejects expired proof",async()=>{
 vi.stubEnv("NEXTAUTH_SECRET","synthetic-unit-proof-secret-32-characters");
 const token=await issueExerciseUploadProof(claim(Buffer.from("fixture")),-120);
 expect(await readExerciseUploadProof(token,"owner","exercise")).toBeNull();
});
it("decodes a genuine image and rejects HTML declared as PNG",async()=>{
 const png=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
 expect(await validateExerciseObjectBytes(png,claim(png))).toBe(true);
 const html=Buffer.from("<html><script>fixture</script></html>");
 expect(await validateExerciseObjectBytes(html,claim(html))).toBe(false);
 expect(await validateExerciseObjectBytes(png,{...claim(png),contentType:"image/jpeg"})).toBe(false);
});
it("rejects changed bytes or size even with the original declared MIME",async()=>{
 const png=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
 const changed=Buffer.from(png);changed[changed.length-1]^=1;
 expect(await validateExerciseObjectBytes(changed,claim(png))).toBe(false);
 expect(await validateExerciseObjectBytes(png,{...claim(png),fileSize:png.length+1})).toBe(false);
});
it("requires a matching video container signature, without claiming full video decoding",async()=>{
 const mp4=Buffer.from([0,0,0,24,...Buffer.from("ftypisom"),0,0,0,0,...Buffer.from("isommp42")]);
 expect(await validateExerciseObjectBytes(mp4,claim(mp4,"video/mp4","video"))).toBe(true);
 expect(await validateExerciseObjectBytes(Buffer.from("fake video"),claim(Buffer.from("fake video"),"video/mp4","video"))).toBe(false);
 expect(await validateExerciseObjectBytes(mp4,claim(mp4,"video/webm","video"))).toBe(false);
});
