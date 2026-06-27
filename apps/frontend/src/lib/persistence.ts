import type { CaptionMode } from "./captioningApi"

// --- Session persistence ---

const SESSION_STORAGE_KEY = "captionit-session"

export interface PersistedSession {
  sessionId: string
  dirPath: string
  mode: CaptionMode
}

let _sessionCache: PersistedSession | null

export function readPersistedSession(): PersistedSession | null {
  if (_sessionCache !== undefined) return _sessionCache
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    _sessionCache = raw ? (JSON.parse(raw) as PersistedSession) : null
  } catch {
    _sessionCache = null
  }
  return _sessionCache
}

export function writePersistedSession(session: PersistedSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  _sessionCache = session
}

export function clearPersistedSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  _sessionCache = null
}

// --- User preferences (form state, persisted on every change) ---

const USER_PREFS_KEY = "captionit-prefs"

export interface UserPrefs {
  dirPath: string
  mode: CaptionMode
}

let _userPrefsCache: UserPrefs | null

export function readUserPrefs(): UserPrefs | null {
  if (_userPrefsCache !== undefined) return _userPrefsCache
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY)
    _userPrefsCache = raw ? (JSON.parse(raw) as UserPrefs) : null
  } catch {
    _userPrefsCache = null
  }
  return _userPrefsCache
}

export function writeUserPrefs(prefs: UserPrefs): void {
  localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs))
  _userPrefsCache = prefs
}

// --- Feed panel preferences ---

const FEED_PREFS_KEY = "captionit-feed-prefs"

export interface FeedPrefs {
  x: number
  y: number
  minimized: boolean
}

let _feedPrefsCache: FeedPrefs | null

export function readFeedPrefs(): FeedPrefs | null {
  if (_feedPrefsCache !== undefined) return _feedPrefsCache
  try {
    const raw = localStorage.getItem(FEED_PREFS_KEY)
    _feedPrefsCache = raw ? (JSON.parse(raw) as FeedPrefs) : null
  } catch {
    _feedPrefsCache = null
  }
  return _feedPrefsCache
}

export function writeFeedPrefs(prefs: FeedPrefs): void {
  localStorage.setItem(FEED_PREFS_KEY, JSON.stringify(prefs))
  _feedPrefsCache = prefs
}

// --- Captioning settings ---

const SETTINGS_KEY = "captionit-settings"

export interface PersistedSettings {
  serviceHost: string
  apiKey: string
  modelName: string
  instruction: string
  maxResolution: number
}

let _settingsCache: PersistedSettings | null

export function readSettings(): PersistedSettings | null {
  if (_settingsCache !== undefined) return _settingsCache
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    _settingsCache = raw ? (JSON.parse(raw) as PersistedSettings) : null
  } catch {
    _settingsCache = null
  }
  return _settingsCache
}

export function writeSettings(settings: PersistedSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  _settingsCache = settings
}
