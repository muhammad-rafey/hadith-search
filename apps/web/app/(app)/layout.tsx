import { AnonAuthBootstrap } from "./anon-auth-bootstrap";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <AnonAuthBootstrap />
      <main id="main" className="container mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
