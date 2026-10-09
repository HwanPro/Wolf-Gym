import {createHash,timingSafeEqual} from "node:crypto";
import {decode,encode} from "next-auth/jwt";
import sharp from "sharp";
import {z} from "zod";
import {S3Client,HeadObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {exerciseUploadSchema} from "./exercise-upload-policy";

const proofSchema=z.object({
 purpose:z.literal("exercise-upload-v1"),ownerId:z.string().min(1).max(100),exerciseId:z.string().min(1).max(100),
 fileKey:z.string().regex(/^exercises\/(images|videos)\/[a-zA-Z0-9._-]+$/),
 type:z.enum(["image","video"]),contentType:z.string(),fileSize:z.number().int().positive(),checksumSHA256:z.string(),
});
export type ExerciseUploadProof=Omit<z.infer<typeof proofSchema>,"purpose">;
export async function issueExerciseUploadProof(claims:ExerciseUploadProof,maxAge=300){
 return encode({secret:process.env.NEXTAUTH_SECRET!,maxAge,token:{...claims,id:claims.ownerId,purpose:"exercise-upload-v1"}});
}
export async function readExerciseUploadProof(token:string,ownerId:string,exerciseId:string):Promise<ExerciseUploadProof|null>{
 try{
  const decoded=await decode({token,secret:process.env.NEXTAUTH_SECRET!}),parsed=proofSchema.safeParse(decoded);
  if(!parsed.success||parsed.data.ownerId!==ownerId||parsed.data.exerciseId!==exerciseId)return null;
  const value=parsed.data;
  if(!exerciseUploadSchema.safeParse({...value,filename:value.fileKey.split("/").pop()}).success)return null;
  if(!value.fileKey.startsWith(value.type==="image"?"exercises/images/":"exercises/videos/"))return null;
  return value;
 }catch{return null;}
}
export async function validateExerciseObjectBytes(body:Buffer,proof:ExerciseUploadProof){
 if(body.length!==proof.fileSize)return false;
 const expected=Buffer.from(proof.checksumSHA256,"base64"),actual=createHash("sha256").update(body).digest();
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return false;
 if(proof.type==="image"){
  try{
   const image=sharp(body,{limitInputPixels:40_000_000,failOn:"error"});
   const metadata=await image.metadata(),format=({"image/png":"png","image/jpeg":"jpeg","image/webp":"webp"} as Record<string,string>)[proof.contentType];
   if(!format||metadata.format!==format)return false;
   await image.toBuffer();return true;
  }catch{return false;}
 }
 // Video policy validates the container signature, not codecs or malware.
 if(proof.contentType==="video/mp4")return body.length>=24&&body.subarray(4,8).toString("ascii")==="ftyp"&&body.readUInt32BE(0)>=16&&body.readUInt32BE(0)<=body.length;
 if(proof.contentType==="video/webm")return body.length>=16&&body.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&body.subarray(0,4096).includes(Buffer.from("webm"));
 return false;
}
export function exerciseObjectURL(fileKey:string){
 return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}
export async function verifyExerciseStoredObject(proof:ExerciseUploadProof){
 const s3=new S3Client({region:process.env.AWS_REGION!,credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID!,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY!},maxAttempts:1});
 try{
  const params={Bucket:process.env.AWS_BUCKET_NAME!,Key:proof.fileKey};
  const head=await s3.send(new HeadObjectCommand(params));
  if(head.ContentLength!==proof.fileSize||head.ContentType!==proof.contentType||head.Metadata?.exerciseid!==proof.exerciseId||head.Metadata?.uploadedby!==proof.ownerId)return false;
  // Bound the response even if an object is replaced between HEAD and GET.
  const object=await s3.send(new GetObjectCommand({...params,Range:`bytes=0-${proof.fileSize}`}));
  if(!object.Body)return false;
  return validateExerciseObjectBytes(Buffer.from(await object.Body.transformToByteArray()),proof);
 }catch{return false;}finally{s3.destroy();}
}
