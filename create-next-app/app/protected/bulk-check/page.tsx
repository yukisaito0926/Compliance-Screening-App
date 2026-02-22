import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BulkCheckForm } from "@/components/bulk-check-form";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}

export default function BulkCheckPage() {
  return (
    <Suspense>
      <AuthGuard>
        <div className="flex-1 w-full flex flex-col gap-8">
          <div>
            <h1 className="text-2xl font-bold">一括チェック</h1>
            <p className="text-muted-foreground text-sm mt-1">
              CSVファイルをアップロードして、複数の取引先を一度にチェックします。最大10件まで。
            </p>
          </div>
          <BulkCheckForm />
        </div>
      </AuthGuard>
    </Suspense>
  );
}
