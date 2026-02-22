import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComplianceCheckForm } from "@/components/compliance-check-form";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">反社チェック</h1>
        <p className="text-muted-foreground text-sm mt-1">
          取引先名を入力すると、AIがネット上の情報を調査して判定します。
        </p>
      </div>
      <ComplianceCheckForm />
    </div>
  );
}
