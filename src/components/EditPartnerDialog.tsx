import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updatePartnerProfile } from "@/lib/admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

export function EditPartnerDialog({ partner }: { partner: any }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    full_name: partner.full_name ?? "",
    phone: partner.phone ?? "",
    home_area: partner.home_area ?? "",
    aadhaar_number: partner.aadhaar_number ?? "",
    pan_number: partner.pan_number ?? "",
    bank_account_number: partner.bank_account_number ?? "",
    bank_ifsc: partner.bank_ifsc ?? "",
    level: partner.level ?? "bronze",
    rating: Number(partner.rating ?? 5),
    status: partner.status ?? "active",
    aadhaar_verified: !!partner.aadhaar_verified,
    pan_verified: !!partner.pan_verified,
    bank_verified: !!partner.bank_verified,
  });
  const fn = useServerFn(updatePartnerProfile);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => fn({ data: { id: partner.id, ...f, rating: Number(f.rating) } }),
    onSuccess: () => { toast.success("Partner updated"); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit partner · {partner.partner_code}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Home area"><Input value={f.home_area} onChange={(e) => setF({ ...f, home_area: e.target.value })} /></Field>
          <Field label="Aadhaar"><Input value={f.aadhaar_number} onChange={(e) => setF({ ...f, aadhaar_number: e.target.value })} /></Field>
          <Field label="PAN"><Input value={f.pan_number} onChange={(e) => setF({ ...f, pan_number: e.target.value })} /></Field>
          <Field label="Bank account"><Input value={f.bank_account_number} onChange={(e) => setF({ ...f, bank_account_number: e.target.value })} /></Field>
          <Field label="IFSC"><Input value={f.bank_ifsc} onChange={(e) => setF({ ...f, bank_ifsc: e.target.value })} /></Field>
          <Field label="Level">
            <Select value={f.level} onValueChange={(v) => setF({ ...f, level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bronze">Bronze</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="platinum">Platinum</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rating (0–5)"><Input type="number" step="0.1" min="0" max="5" value={f.rating} onChange={(e) => setF({ ...f, rating: Number(e.target.value) })} /></Field>
          <Field label="Status">
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending_verification">Pending verification</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Toggle label="Aadhaar verified" v={f.aadhaar_verified} onChange={(v) => setF({ ...f, aadhaar_verified: v })} />
          <Toggle label="PAN verified" v={f.pan_verified} onChange={(v) => setF({ ...f, pan_verified: v })} />
          <Toggle label="Bank verified" v={f.bank_verified} onChange={(v) => setF({ ...f, bank_verified: v })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;
}
function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
      <span>{label}</span><Switch checked={v} onCheckedChange={onChange} />
    </div>
  );
}
