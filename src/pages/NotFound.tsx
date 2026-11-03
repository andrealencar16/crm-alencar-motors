import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mb-6 text-8xl font-bold text-primary/20">404</div>
        <h1 className="text-2xl font-bold">Página não encontrada</h1>
        <p className="mt-2 text-muted-foreground">
          A página <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{location.pathname}</code> não existe ou foi movida.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar
          </Button>
          <Button onClick={() => navigate("/")}>
            <Home className="mr-2 h-4 w-4" />Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
