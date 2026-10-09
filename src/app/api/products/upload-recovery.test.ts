import {NextRequest} from "next/server";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import sharp from "sharp";
const mocks=vi.hoisted(()=>({send:vi.fn(),create:vi.fn(),findFirst:vi.fn(),token:vi.fn()}));
vi.mock("@/server/auth/authorization",()=>({requestToken:mocks.token}));
vi.mock("@/infrastructure/prisma/prisma",()=>({default:{inventoryItem:{create:mocks.create,findFirst:mocks.findFirst}}}));
vi.mock("@aws-sdk/client-s3",async original=>({...await original<typeof import("@aws-sdk/client-s3")>(),S3Client:class{send=mocks.send;}}));
import {POST} from "./route";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES","0");mocks.token.mockResolvedValue({id:"admin",role:"admin"});mocks.send.mockResolvedValue({});mocks.findFirst.mockResolvedValue(null);vi.spyOn(console,"error").mockImplementation(()=>{});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
async function request(){const form=new FormData();const bytes=await sharp({create:{width:2,height:2,channels:3,background:"gold"}}).png().toBuffer();form.set("file",new File([bytes],"test.png",{type:"image/png"}));for(const [key,value] of Object.entries({item_name:"Prueba",item_description:"Prueba",item_price:"1",item_stock:"0"}))form.set(key,value);return new NextRequest("http://localhost/api/products",{method:"POST",body:form});}
it("removes only the newly uploaded object when database persistence fails",async()=>{
 mocks.create.mockRejectedValue(new Error("database unavailable"));
 expect((await POST(await request())).status).toBe(500);
 expect(mocks.send).toHaveBeenCalledTimes(2);
 const [put,remove]=mocks.send.mock.calls.map(call=>call[0]);
 expect(put.constructor.name).toBe("PutObjectCommand");expect(remove.constructor.name).toBe("DeleteObjectCommand");expect(remove.input.Key).toBe(put.input.Key);expect(remove.input.Key).toMatch(/^uploads\/[a-f0-9-]+-test.png$/);
});
it("keeps a new object after successful database persistence",async()=>{
 mocks.create.mockResolvedValue({item_id:"created"});expect((await POST(await request())).status).toBe(201);expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("does not delete any object when the storage upload itself fails",async()=>{
 mocks.send.mockRejectedValue(new Error("denied"));expect((await POST(await request())).status).toBe(500);expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.create).not.toHaveBeenCalled();
});
it("keeps a referenced object after an uncertain database response",async()=>{
 mocks.create.mockRejectedValue(new Error("response lost after commit"));mocks.findFirst.mockResolvedValue({item_id:"committed"});expect((await POST(await request())).status).toBe(500);expect(mocks.send).toHaveBeenCalledTimes(1);
});
