// Сохранение в секретном гисте GitHub. Токену нужно одно право: «Gists: Read and write».
// Всё сохранение это один файл; гист находится по имени файла, поэтому на втором
// устройстве достаточно вставить токен, id гиста вводить не надо.

export const SAVE_FILE = 'taskcraft-lager.json';
const API = 'https://api.github.com';

/** Ссылка на создание токена: название, срок и право на гисты уже выбраны. */
export const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=' +
  encodeURIComponent('Лагерь у костра') +
  '&description=' +
  encodeURIComponent('Сохранение игры в секретном гисте') +
  '&expires_in=366&gists=write';

export type GitHubErrorKind = 'auth' | 'access' | 'missing' | 'network' | 'other';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: GitHubErrorKind,
  ) {
    super(message);
  }
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Файл сохранения в гисте. stamp меняется при каждой записи: по нему видно, что гист обновили. */
export interface SaveDoc {
  app: 'taskcraft-lager';
  format: 1;
  stamp: string;
  savedAt: number;
  /** Откуда записано: «телефон» или «компьютер». */
  device: string;
  state: unknown;
}

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

export class GitHub {
  constructor(
    private token: string,
    private fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}, on404: GitHubErrorKind = 'missing'): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new GitHubError('Нет связи с GitHub', 'network');
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401) throw new GitHubError('GitHub не принял токен: он неверный или истёк', 'auth');
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      throw new GitHubError('GitHub просит подождать: слишком много запросов', 'other');
    }
    if (res.status === 403 || (res.status === 404 && on404 === 'access')) {
      throw new GitHubError('У токена нет права на гисты. Нужно право «Gists: Read and write»', 'access');
    }
    if (res.status === 404) throw new GitHubError('Гист с сохранением не найден. Его удалили?', 'missing');
    throw new GitHubError(`GitHub ответил ошибкой ${res.status}`, 'other');
  }

  /** Имя владельца токена. */
  async user(): Promise<string> {
    const me = await this.call<{ login: string }>('/user');
    return me.login;
  }

  /** Гист с сохранением Лагеря, самый свежий, если их несколько. */
  async findSave(): Promise<string | null> {
    let best: { id: string; at: string } | null = null;
    for (let page = 1; page <= 10; page++) {
      const list = await this.call<{ id: string; updated_at: string; files: Record<string, unknown> }[]>(
        `/gists?per_page=100&page=${page}`,
        {},
        'access',
      );
      for (const g of list) {
        if (g.files && SAVE_FILE in g.files && (!best || g.updated_at > best.at)) best = { id: g.id, at: g.updated_at };
      }
      if (list.length < 100) break;
    }
    return best?.id ?? null;
  }

  /** Сохранение из гиста; null, если файла в гисте нет. */
  async read(gistId: string): Promise<SaveDoc | null> {
    const gist = await this.call<{ files: Record<string, GistFile | null> }>(`/gists/${gistId}`);
    const file = gist.files?.[SAVE_FILE];
    if (!file) return null;
    let text = file.content ?? '';
    // Большой файл GitHub отдаёт обрезанным, целиком он лежит по raw_url.
    if (file.truncated && file.raw_url) {
      try {
        text = await (await this.fetchFn(file.raw_url, { cache: 'no-store' })).text();
      } catch {
        throw new GitHubError('Нет связи с GitHub', 'network');
      }
    }
    try {
      const doc = JSON.parse(text) as SaveDoc;
      if (doc?.app !== 'taskcraft-lager' || typeof doc.stamp !== 'string') throw new Error();
      return doc;
    } catch {
      throw new GitHubError('В гисте повреждённое сохранение', 'other');
    }
  }

  /** Новый секретный гист с сохранением; возвращает его id. */
  async create(doc: SaveDoc): Promise<string> {
    const gist = await this.call<{ id: string }>(
      '/gists',
      {
        method: 'POST',
        body: JSON.stringify({
          description: 'Лагерь у костра: сохранение игры',
          public: false,
          files: { [SAVE_FILE]: { content: JSON.stringify(doc) } },
        }),
      },
      'access',
    );
    return gist.id;
  }

  async write(gistId: string, doc: SaveDoc): Promise<void> {
    await this.call(`/gists/${gistId}`, {
      method: 'PATCH',
      body: JSON.stringify({ files: { [SAVE_FILE]: { content: JSON.stringify(doc) } } }),
    });
  }
}
