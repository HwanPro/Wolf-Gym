"use client";
import {useCallback,useEffect,useState} from "react";
import {Button} from "@/ui/button";
import {Dialog,DialogContent,DialogTitle,DialogTrigger} from "@/ui/dialog";

type Media={id:string;type:"image"|"video";url:string;title?:string;order:number;isCover:boolean};
export default function ExerciseMediaDialog({exerciseId,name}:{exerciseId:string;name:string}){
 const [open,setOpen]=useState(false),[media,setMedia]=useState<Media[]>([]),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState(""),[deleting,setDeleting]=useState<string|null>(null);
 const endpoint=`/api/exercises/${exerciseId}/media`;
 const load=useCallback(async()=>{
  const response=await fetch(endpoint,{cache:"no-store"}),data=await response.json();
  if(!response.ok||!Array.isArray(data))throw new Error(data.error||"No se pudieron cargar los archivos");
  setMedia(data);
 },[endpoint]);
 useEffect(()=>{if(open)void load().catch(e=>setError(e.message));},[open,load]);
 async function action(work:()=>Promise<void>){
  setBusy(true);setError("");setStatus("");
  try{await work();await load();}catch(e){setStatus("");setError(e instanceof TypeError?"No se pudo conectar con el almacenamiento. Revisa la conexión y la configuración de cargas; el archivo no se añadió al ejercicio":e instanceof Error?e.message:"No se pudo completar la operación");}
  finally{setBusy(false);}
 }
 async function upload(){
  if(!file)return;
  await action(async()=>{
   setStatus("Subiendo y verificando archivo…");
   const type=file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":null;
   if(!type)throw new Error("Selecciona una imagen JPEG, PNG o WebP, o un video MP4 o WebM");
   if(file.size>(type==="image"?5:50)*1024*1024)throw new Error(type==="image"?"La imagen excede 5 MiB":"El video excede 50 MiB");
   const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
   const checksumSHA256=btoa(String.fromCharCode(...digest));
   const prepared=await fetch(endpoint+"/presign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,contentType:file.type,filename:file.name,fileSize:file.size,checksumSHA256})});
   const signed=await prepared.json();if(!prepared.ok)throw new Error(signed.error||"No se pudo preparar la carga");
   const uploaded=await fetch(signed.uploadUrl,{method:"PUT",headers:signed.requiredHeaders,body:file});
   if(!uploaded.ok)throw new Error("El almacenamiento rechazó la carga. El archivo no se añadió al ejercicio");
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,url:signed.publicUrl,uploadToken:signed.uploadToken,title:file.name,isCover:media.length===0})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudo verificar el archivo subido");
   setFile(null);setStatus("Archivo verificado y añadido");
  });
 }
 async function update(id:string,data:{isCover?:boolean;order?:number}){
  await action(async()=>{const response=await fetch(`/api/media/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});if(!response.ok)throw new Error((await response.json()).error||"No se pudo actualizar el archivo");setStatus("Archivo actualizado");});
 }
 async function remove(id:string){
  await action(async()=>{const response=await fetch(`/api/media/${id}`,{method:"DELETE"});if(response.status!==204)throw new Error((await response.json()).error||"No se pudo eliminar el archivo");setDeleting(null);setStatus("Archivo retirado del ejercicio");});
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);setDeleting(null);setError("");}}}>
  <DialogTrigger asChild><Button size="sm" variant="outline" aria-label={`Media de ${name}`}>Media</Button></DialogTrigger>
  <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-zinc-700 bg-zinc-950 text-white">
   <DialogTitle>Archivos de {name}</DialogTitle>
   <p className="text-sm text-zinc-300">Imágenes JPEG, PNG o WebP hasta 5 MiB. Videos MP4 o WebM hasta 50 MiB.</p>
   <label className="grid gap-2 text-sm">Seleccionar imagen o video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy} onChange={event=>setFile(event.target.files?.[0]||null)} className="rounded border border-zinc-600 p-2" /></label>
   <Button type="button" disabled={busy||!file} onClick={()=>void upload()}>{busy?"Procesando…":"Subir archivo"}</Button>
   {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
   {status&&<p role="status" className="text-sm text-yellow-200">{status}</p>}
   <div className="grid gap-4">
    {media.map(item=><article key={item.id} aria-label={item.title||item.type} className="rounded border border-zinc-700 p-3">
     {item.type==="image"?<div className="h-40 rounded bg-zinc-900 bg-contain bg-center bg-no-repeat" role="img" aria-label={item.title||"Imagen del ejercicio"} style={{backgroundImage:`url(${JSON.stringify(item.url)})`}} />:<video controls preload="metadata" src={item.url} aria-label={item.title||"Video del ejercicio"} className="max-h-48 w-full" />}
     <p className="mt-2 break-all text-sm">{item.title||item.type}{item.isCover?" · Portada":""}</p>
     <div className="mt-2 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">Orden<input type="number" min="0" step="1" defaultValue={item.order} key={item.order} disabled={busy} aria-label={`Orden de ${item.title||item.id}`} onBlur={event=>{const order=Number(event.target.value);if(Number.isInteger(order)&&order>=0&&order!==item.order)void update(item.id,{order});}} className="w-20 rounded border border-zinc-600 bg-black p-2" /></label>
      <Button type="button" size="sm" variant="outline" disabled={busy||item.isCover} onClick={()=>void update(item.id,{isCover:true})}>{item.isCover?"Portada actual":"Usar como portada"}</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setDeleting(item.id)}>Retirar archivo</Button>
     </div>
     {deleting===item.id&&<div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-sm">¿Retirar este archivo del ejercicio?</p><Button type="button" size="sm" disabled={busy} onClick={()=>void remove(item.id)}>Confirmar retiro</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setDeleting(null)}>Conservar</Button></div>}
    </article>)}
    {!media.length&&<p className="text-sm text-zinc-300">Este ejercicio todavía no tiene archivos.</p>}
   </div>
  </DialogContent>
 </Dialog>;
}
