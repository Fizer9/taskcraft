// Все слова мира в одном месте: экраны берут названия только отсюда.
import type { UndeadRank } from './rules';
import type { Shift } from './time';
import type { Level, QuestColor, QuestKind } from './types';

export type ClassId = 'rogue' | 'barbarian' | 'mage' | 'knight';

export const CLASS_BY_LEVEL: Record<Level, ClassId> = { 1: 'rogue', 2: 'barbarian', 3: 'mage', 4: 'knight' };

export const CLASS_NAME: Record<ClassId, string> = {
  rogue: 'Разбойник',
  barbarian: 'Варвар',
  mage: 'Маг',
  knight: 'Рыцарь',
};

/** «у разбойника», «у мага»: кто из отряда взял задачу. */
export const CLASS_AT: Record<ClassId, string> = {
  rogue: 'у разбойника',
  barbarian: 'у варвара',
  mage: 'у мага',
  knight: 'у рыцаря',
};

export const LEVEL_ROMAN: Record<Level, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

export const LEVEL_HINT: Record<Level, string> = {
  1: 'до получаса',
  2: 'пара часов',
  3: 'целый день',
  4: 'несколько дней',
};

export const UNDEAD_NAME: Record<UndeadRank, string> = {
  minion: 'Скелет-миньон',
  rogue: 'Скелет-разбойник',
  warrior: 'Скелет-воин',
  mage: 'Скелет-маг',
};

export const QUEST_KIND_NAME: Record<QuestKind, string> = {
  work: 'рабочий',
  personal: 'личный',
  any: 'в любое время',
};

export const QUEST_KIND_HINT: Record<QuestKind, string> = {
  work: 'в полной силе в рабочие часы',
  personal: 'в полной силе вечером и в выходные',
  any: 'без привязки ко времени',
};

export const QUEST_COLOR_NAME: Record<QuestColor, string> = {
  red: 'алое',
  blue: 'синее',
  green: 'зелёное',
  yellow: 'золотое',
  purple: 'лиловое',
  brown: 'бурое',
};

export const SHIFT_NAME: Record<Shift, string> = {
  morning: 'Утро',
  work: 'День',
  evening: 'Вечер',
  weekend: 'Выходной',
  night: 'Ночь',
};

export const W = {
  appName: 'Лагерь',
  camp: 'Лагерь',
  plan: 'Сбор отряда',
  realm: 'Королевство',
  chronicle: 'Летопись',
  gold: 'Золото',
  mana: 'Мана',
  xp: 'опыт',
  nowAtFire: 'Сейчас у костра',
  atFireEmpty: 'У огня пусто',
  moreToday: 'Ещё сегодня',
  evening: 'Вечером',
  done: 'Готово',
  rest: 'Привал',
  backOnRoad: 'Снова в путь',
  callToFire: 'Позвать к огню',
  callToFireShort: 'К огню',
  pause: 'Пауза',
  resume: 'Продолжить',
  release: 'Отпустить',
  frog: 'лягушка дня',
  frogTitle: 'Лягушка дня',
  secondWind: 'Второе дыхание',
  lightFire: 'Разжечь костёр',
  lightsOut: 'Отбой',
  notSleeping: 'Ещё не сплю',
  keepAtFire: 'Оставить у огня на завтра',
  lair: 'логово',
  trophies: 'Зал трофеев',
  inbox: 'Письма',
  quest: 'Поход',
  quests: 'Походы',
  undead: 'Нежить на дороге',
  slay: 'Упокоить',
  stillWorking: 'Да, работаю',
  notWorking: 'Нет, был перерыв',
  later: 'позже',
} as const;
