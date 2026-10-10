import { SEARCH_REQUEST_LIMIT } from '../../shared/constants.js';
import { AppError, ERROR_TYPES } from './errors.js';

export function createRequestBudget(limit = SEARCH_REQUEST_LIMIT) {
  let used = 0;
  return {
    consume() {
      if (used >= limit) {
        throw new AppError(
          ERROR_TYPES.SEARCH_REQUEST_LIMIT,
          `本轮搜索已达到 ${limit} 次 CC98 请求上限`
        );
      }
      used += 1;
    },
    get used() { return used; },
    get remaining() { return Math.max(0, limit - used); },
    limit,
  };
}
