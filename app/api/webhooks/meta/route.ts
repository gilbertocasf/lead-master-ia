import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  compararTextoSeguro,
  extrairEventosLeadgen,
  obterConfigMeta,
  validarAssinatura,
} from "@/lib/meta";
import { gravarEventos, processarLista, type NovoEventoMeta } from "@/lib/meta-processar";

// Webhook da Meta (produto Webhooks, objeto Page, campo leadgen).
// Público: a autenticação é a assinatura X-Hub-Signature-256 (POST) e o
// META_VERIFY_TOKEN (GET de verificação). Liberado sem sessão no middleware.
//
// Nunca registrar o corpo do aviso em log.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const PRAZO_PROCESSAMENTO_MS = 8000;
const TAMANHO_MAXIMO_CORPO = 5 * 1024 * 1024;

// GET — verificação da assinatura do webhook no painel da Meta.
export async function GET(req: NextRequest) {
  const config = obterConfigMeta();
  if (!config.verifyToken) {
    return NextResponse.json({ erro: "meta_nao_configurada" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    compararTextoSeguro(token, config.verifyToken) &&
    challenge &&
    /^[A-Za-z0-9._~-]{1,256}$/.test(challenge)
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse("Forbidden", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// POST — aviso de novo lead.
export async function POST(req: NextRequest) {
  const inicio = Date.now();
  const config = obterConfigMeta();

  // Sem App Secret não há como validar a assinatura: nunca aceitar sem ela.
  if (!config.appSecret) {
    console.error("[webhook meta] META_APP_SECRET não configurado — aviso recusado.");
    return NextResponse.json({ erro: "meta_nao_configurada" }, { status: 503 });
  }

  const tamanho = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(tamanho) && tamanho > TAMANHO_MAXIMO_CORPO) {
    return NextResponse.json({ erro: "payload_muito_grande" }, { status: 413 });
  }

  // A assinatura é calculada sobre os bytes exatos enviados pela Meta: ler o
  // corpo bruto, validar e só então decodificar como UTF-8.
  let bruto: ReturnType<typeof Buffer.from>;
  try {
    bruto = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }
  if (bruto.length > TAMANHO_MAXIMO_CORPO) {
    return NextResponse.json({ erro: "payload_muito_grande" }, { status: 413 });
  }

  if (!validarAssinatura(bruto, req.headers.get("x-hub-signature-256"), config.appSecret)) {
    console.warn("[webhook meta] assinatura inválida — aviso recusado.");
    return NextResponse.json({ erro: "assinatura_invalida" }, { status: 401 });
  }

  const corpo = bruto.toString("utf8");

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }

  const { eventos, descartados } = extrairEventosLeadgen(payload);
  if (eventos.length === 0) {
    // Aviso de outro campo/objeto ou sem leadgen_id: confirma para a Meta não reenviar.
    return NextResponse.json({ recebidos: 0, processados: 0, descartados }, { status: 200 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error(
      "[webhook meta] createSupabaseAdmin:",
      err instanceof Error ? err.message : "erro desconhecido"
    );
    // 500: a Meta reenvia o aviso.
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 500 });
  }

  const linhas: NovoEventoMeta[] = eventos.map((e) => ({
    leadgen_id: e.leadgen_id,
    page_id: e.page_id,
    form_id: e.form_id,
    ad_id: e.ad_id,
    adgroup_id: e.adgroup_id,
    origem: "webhook",
    // Só identificadores e datas: o aviso da Meta não traz dados pessoais.
    payload: {
      leadgen_id: e.leadgen_id,
      page_id: e.page_id,
      form_id: e.form_id,
      ad_id: e.ad_id,
      adgroup_id: e.adgroup_id,
      created_time: e.created_time,
      entry_time: e.entry_time,
    },
  }));

  const gravacao = await gravarEventos(admin, linhas);
  if (!gravacao.ok) {
    // 500 para a Meta reenviar (ela tenta de novo por até 36 h).
    return NextResponse.json(
      { erro: gravacao.migration_pendente ? "migration_pendente" : "falha_gravacao" },
      { status: 500 }
    );
  }

  // Processa os eventos novos no mesmo request, até o prazo. O que sobrar
  // fica "recebido" para o cron.
  const resumo = await processarLista(
    admin,
    gravacao.novos.map((n) => n.id),
    inicio + PRAZO_PROCESSAMENTO_MS
  );

  console.info(
    `[webhook meta] recebidos=${eventos.length} novos=${gravacao.novos.length} ` +
      `processados=${resumo.processados} duplicados=${resumo.duplicados} erros=${resumo.erros} ` +
      `pendentes=${resumo.sem_tempo} descartados=${descartados} ms=${Date.now() - inicio}`
  );

  return NextResponse.json(
    {
      recebidos: eventos.length,
      novos: gravacao.novos.length,
      processados: resumo.processados + resumo.duplicados + resumo.ignorados,
      pendentes: resumo.sem_tempo,
    },
    { status: 200 }
  );
}
