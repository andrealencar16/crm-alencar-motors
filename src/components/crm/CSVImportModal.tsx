import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  entityType: "contacts" | "companies";
}

const contactFields = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Sobrenome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "title", label: "Cargo" },
  { key: "status", label: "Status" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "__skip", label: "— Ignorar —" },
];

const companyFields = [
  { key: "name", label: "Nome" },
  { key: "domain", label: "Domínio" },
  { key: "industry", label: "Indústria" },
  { key: "size", label: "Tamanho" },
  { key: "revenue", label: "Receita" },
  { key: "website", label: "Website" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "__skip", label: "— Ignorar —" },
];

export function CSVImportModal({ open, onOpenChange, onImported, entityType }: CSVImportModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);

  const fields = entityType === "contacts" ? contactFields : companyFields;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
      if (lines.length < 2) { toast({ title: "CSV vazio ou inválido", variant: "destructive" }); return; }
      setCsvHeaders(lines[0]);
      setCsvRows(lines.slice(1).filter((r) => r.some((c) => c)));
      // Auto-map by header name
      const autoMap: Record<number, string> = {};
      lines[0].forEach((header, i) => {
        const lower = header.toLowerCase();
        const match = fields.find((f) =>
          f.key !== "__skip" && (f.label.toLowerCase() === lower || f.key === lower ||
            (f.key === "first_name" && (lower.includes("nome") || lower.includes("first"))) ||
            (f.key === "last_name" && (lower.includes("sobrenome") || lower.includes("last"))) ||
            (f.key === "email" && lower.includes("email")) ||
            (f.key === "phone" && (lower.includes("telefone") || lower.includes("phone"))) ||
            (f.key === "name" && lower.includes("empresa")))
        );
        autoMap[i] = match?.key || "__skip";
      });
      setMapping(autoMap);
      setStep("mapping");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!orgId) return;
    setImporting(true);
    try {
      const records = csvRows.map((row) => {
        const record: Record<string, any> = { org_id: orgId, owner_id: user?.id };
        Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
          if (fieldKey !== "__skip") {
            record[fieldKey] = row[Number(colIdx)] || null;
          }
        });
        return record;
      });

      // Filter out records without required fields
      const valid = entityType === "contacts"
        ? records.filter((r) => r.first_name)
        : records.filter((r) => r.name);

      if (valid.length === 0) {
        toast({ title: "Nenhum registro válido", variant: "destructive" });
        setImporting(false);
        return;
      }

      const { error } = await supabase.from(entityType).insert(valid as any);
      if (error) { toast({ title: "Erro na importação", description: error.message, variant: "destructive" }); setImporting(false); return; }

      toast({ title: `${valid.length} registros importados` });
      onOpenChange(false);
      onImported();
      resetState();
    } finally {
      setImporting(false);
    }
  };

  const resetState = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo CSV para importar"}
            {step === "mapping" && "Mapeie as colunas do CSV para os campos"}
            {step === "preview" && `Preview: ${csvRows.length} registros`}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Arraste ou selecione um arquivo .csv</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()}>
              <FileText className="mr-2 h-4 w-4" />Selecionar Arquivo
            </Button>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="space-y-2">
              {csvHeaders.map((header, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm font-medium">{header}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select value={mapping[i] || "__skip"} onValueChange={(v) => setMapping({ ...mapping, [i]: v })}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={() => setStep("preview")}>Preview</Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="rounded-md border border-border max-h-60 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.entries(mapping).filter(([, v]) => v !== "__skip").map(([i, key]) => (
                      <TableHead key={i} className="text-xs">{fields.find((f) => f.key === key)?.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, 5).map((row, ri) => (
                    <TableRow key={ri}>
                      {Object.entries(mapping).filter(([, v]) => v !== "__skip").map(([i]) => (
                        <TableCell key={i} className="text-xs">{row[Number(i)]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {csvRows.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">... e mais {csvRows.length - 5} registros</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Importando..." : `Importar ${csvRows.length} registros`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
