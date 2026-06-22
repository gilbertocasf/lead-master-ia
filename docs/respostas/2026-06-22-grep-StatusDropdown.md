# grep -R "StatusDropdown" -n app components

```
app/(app)/pipeline/page.tsx:5:   import { StatusDropdown } from "@/components/pipeline/StatusDropdown";
app/(app)/pipeline/page.tsx:79:  <StatusDropdown leadId={lead.id} statusAtual={lead.status} />
components/pipeline/StatusDropdown.tsx:14: export function StatusDropdown({ leadId, statusAtual }: Props) {
```

## Resumo

- Definido em: `components/pipeline/StatusDropdown.tsx` (linha 14)
- Importado e usado em: `app/(app)/pipeline/page.tsx` (linhas 5 e 79)
