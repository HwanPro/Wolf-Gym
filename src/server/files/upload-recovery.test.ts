import {afterEach,expect,it,vi} from "vitest";
import {discardNewUploadIfUnreferenced} from "./upload-recovery";
afterEach(()=>vi.restoreAllMocks());
it("deletes only after a fresh database read confirms no reference",async()=>{const remove=vi.fn().mockResolvedValue(undefined);expect(await discardNewUploadIfUnreferenced(async()=>false,remove)).toBe("removed");expect(remove).toHaveBeenCalledOnce();});
it("preserves an object when the write committed despite an earlier error",async()=>{const remove=vi.fn();expect(await discardNewUploadIfUnreferenced(async()=>true,remove)).toBe("referenced");expect(remove).not.toHaveBeenCalled();});
it("preserves an object if the database cannot confirm the outcome",async()=>{vi.spyOn(console,"error").mockImplementation(()=>{});const remove=vi.fn();expect(await discardNewUploadIfUnreferenced(async()=>{throw new Error("offline");},remove)).toBe("unconfirmed");expect(remove).not.toHaveBeenCalled();});
it("does not report a failed cleanup as completed",async()=>{vi.spyOn(console,"error").mockImplementation(()=>{});expect(await discardNewUploadIfUnreferenced(async()=>false,async()=>{throw new Error("denied");})).toBe("unconfirmed");});
