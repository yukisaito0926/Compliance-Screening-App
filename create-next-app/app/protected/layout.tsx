import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-6 items-center font-semibold">
              <Link href="/protected" className="text-base">
                総合チェック
              </Link>
              <Link
                href="/protected/compliance"
                className="text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                反社チェック
              </Link>
              <Link
                href="/protected/company-info"
                className="text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                会社情報確認
              </Link>
              <Link
                href="/protected/bulk-check"
                className="text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                一括チェック
              </Link>
              <Link
                href="/protected/hotel-lookup"
                className="text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                旅館検索
              </Link>
              <Link
                href="/protected/history"
                className="text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                チェック履歴
              </Link>
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
