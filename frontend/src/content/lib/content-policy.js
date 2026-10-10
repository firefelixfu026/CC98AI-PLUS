const RESTRICTED_NOTICE = /(?:请勿|禁止|不得|不允许)(?:转载|转发|外传|截图)|(?:勿转|仅限校内|不要外传)/i;

export function hasRestrictedNotice(text) {
  return RESTRICTED_NOTICE.test(String(text || ''));
}
