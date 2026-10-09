import { NextRequest } from "next/server";
import { POST as cashAction } from "@/app/api/admin/cash/[action]/route";
export { GET } from "@/app/api/admin/cash/route";
export function POST(request: NextRequest) { return cashAction(request, { params: Promise.resolve({ action: "sale" }) }); }
