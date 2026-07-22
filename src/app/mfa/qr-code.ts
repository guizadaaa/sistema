/**
 * data.totp.qr_code (supabase.auth.mfa.enroll) já vem pronto como data URL
 * SVG no exemplo oficial do Supabase (usado direto em <img src={qr} />), mas
 * a documentação de tipos descreve como se fosse preciso prefixar
 * "data:image/svg+xml;utf-8," antes de usar — as duas fontes discordam.
 * Detecta o formato em vez de assumir um dos dois: se já é uma data URL, usa
 * direto; senão, monta e codifica.
 */
export function paraSrcQrCode(qrCode: string): string {
  return qrCode.startsWith("data:") ? qrCode : `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}
