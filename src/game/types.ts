// Данные игры. Всё, что сохраняется, лежит в State и сериализуется в JSON как есть.

/** Уровень задачи: I до получаса, II пара часов, III целый день, IV несколько дней. */
export type Level = 1 | 2 | 3 | 4;

/** Когда поход в полной силе: в рабочие часы, вечером и в выходные, или в любое время. */
export type QuestKind = 'work' | 'personal' | 'any';

export type QuestColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'brown';

/** inbox: письмо у вестника, ещё не разобрано; open: спутник в отряде. */
export type TaskStatus = 'inbox' | 'open' | 'done' | 'released';

/** Игровой день в виде YYYY-MM-DD. День начинается в 4:00, а не в полночь. */
export type DayKey = string;

export interface Quest {
  id: string;
  name: string;
  kind: QuestKind;
  color: QuestColor;
  createdAt: number;
  /** Логово пало, поход ушёл в зал трофеев. */
  wonAt?: number;
}

export interface Reward {
  gold: number;
  xp: number;
  frog: boolean;
  /** Задача была нежитью: при отмене «Готово» счёт упокоенных за день уменьшается. */
  undead?: boolean;
  /** Урон логову похода, равен уровню задачи. */
  damage: number;
}

export interface Task {
  id: string;
  title: string;
  questId: string | null;
  level: Level;
  /** Оценка в минутах. Пустая значит «по уровню». */
  estimateMin: number | null;
  status: TaskStatus;
  /** День, на который спутник позван к костру. */
  day: DayKey | null;
  /** Порядок в плане дня. */
  order: number;
  /** Срок. После него задача встаёт нежитью на лесной дороге. */
  due: DayKey | null;
  /** Время на часах, если задача привязана ко времени, например «20:30». */
  at: string | null;
  spentMs: number;
  createdAt: number;
  doneAt?: number;
  doneDay?: DayKey;
  reward?: Reward;
  /** Когда отпустили и откуда: по этому задачу можно вернуть. */
  releasedAt?: number;
  releasedFrom?: 'open' | 'inbox';
  /** Задача пришла сама от повторяющейся задачи с этим id. */
  routineId?: string;
}

/** Как часто приходит повторяющаяся задача. Рабочие дни берутся из распорядка, weekday: 0 воскресенье. */
export type Repeat = { every: 'day' } | { every: 'workday' } | { every: 'week'; weekday: number };

/**
 * Повторяющаяся задача: в свои дни она сама встаёт в план дня обычной задачей (Task с routineId).
 * Пока прошлая не сделана, новая не приходит: в отряде ждёт одна.
 */
export interface Routine {
  id: string;
  title: string;
  questId: string | null;
  level: Level;
  estimateMin: number | null;
  at: string | null;
  repeat: Repeat;
  createdAt: number;
}

export interface Settings {
  /** Минуты от полуночи. */
  workStart: number;
  workEnd: number;
  /** Дни недели с работой, 0 воскресенье. */
  workDays: number[];
  bedtime: number;
}

export interface DayLog {
  gold: number;
  xp: number;
  done: number;
  workedMs: number;
  restMs: number;
  frog: boolean;
  undeadSlain: number;
}

export interface Current {
  taskId: string;
  /** Когда пошёл таймер; null, если задача у огня, но таймер стоит. */
  runningSince: number | null;
  /** Последний раз, когда игрок был в приложении при идущем таймере. */
  seenAt: number;
  /** Таймер встал сам после 90 минут без игрока. */
  idleSince: number | null;
}

export interface Hero {
  xp: number;
  gold: number;
  mana: number;
}

export interface State {
  v: 2;
  /** Своя у каждой игры: по ней сохранение в GitHub узнаёт, та же это игра или другая. */
  gameId: string;
  createdAt: number;
  /** Последнее действие игрока; null, пока в игре ничего не делали. */
  touchedAt: number | null;
  day: DayKey;
  hero: Hero;
  quests: Quest[];
  tasks: Task[];
  routines: Routine[];
  current: Current | null;
  breakSince: number | null;
  /** Поход последней задачи у огня, для цены переключения. */
  lastQuestId: string | null;
  frogId: string | null;
  /** День, когда разожгли костёр, то есть утвердили план. */
  litDay: DayKey | null;
  /** День, когда прозвучал отбой. */
  closedDay: DayKey | null;
  secondWindDay: DayKey | null;
  settledAt: number;
  log: Record<DayKey, DayLog>;
  settings: Settings;
  seq: number;
}
