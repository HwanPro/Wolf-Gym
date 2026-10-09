import {NextRequest} from "next/server";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import sharp from "sharp";
const mocks=vi.hoisted(()=>({send:vi.fn(),authorize:vi.fn()}));
vi.mock("@/server/auth/authorization",()=>({requireAdmin:mocks.authorize}));
vi.mock("@aws-sdk/client-s3",async importOriginal=>({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client:class {send=mocks.send;},
}));
import {POST} from "./route";
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("WOLF_DISABLE_EXTERNAL_WRITES","0");
 mocks.authorize.mockResolvedValue({authorized:true,token:{id:"admin",role:"admin"}});
 mocks.send.mockResolvedValue({});
});
afterEach(()=>vi.unstubAllEnvs());
function request(file:File){const data=new FormData();data.set("file",file);return new NextRequest("http://localhost/api/uploads",{method:"POST",body:data});}
it("stores signature-accepted PDFs only as download attachments with a safe filename",async()=>{
 const response=await POST(request(new File(["%PDF-1.7\nfixture"],'test".pdf',{type:"application/pdf"})));
 expect(response.status).toBe(200);
 expect(mocks.send.mock.calls[0][0].input).toMatchObject({ContentType:"application/pdf",ContentDisposition:'attachment; filename="test.pdf"',CacheControl:"private, no-store"});
});
it("keeps decoded images available for inline display",async()=>{
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:"#facc15"}}).png().toBuffer();
 expect((await POST(request(new File([bytes],"test.png",{type:"image/png"})))).status).toBe(200);
 expect(mocks.send.mock.calls[0][0].input.ContentDisposition).toBeUndefined();
});
