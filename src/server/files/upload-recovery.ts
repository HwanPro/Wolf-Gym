// A database exception can leave the outcome of a committed write unknown.
// Delete only when a fresh read confirms that no record references the new key.
export async function discardNewUploadIfUnreferenced(
 isReferenced:()=>Promise<boolean>,remove:()=>Promise<unknown>,
):Promise<"removed"|"referenced"|"unconfirmed">{
 try{if(await isReferenced())return "referenced";}
 catch{console.error("No se pudo confirmar el estado de la imagen temporal; se conserva para revisión");return "unconfirmed";}
 try{await remove();return "removed";}
 catch{console.error("No se pudo retirar la imagen temporal; se conserva para revisión");return "unconfirmed";}
}
