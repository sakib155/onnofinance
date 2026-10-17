import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { bn } from './bn'
import { en } from './en'

const saved = (() => {
  try {
    return localStorage.getItem('lang')
  } catch {
    return null
  }
})()

const initial = saved === 'bn' ? 'bn' : 'en'
document.documentElement.lang = initial

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: 'en' | 'bn') {
  i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  try {
    localStorage.setItem('lang', lang)
  } catch {
    // private mode: language just won't be remembered
  }
}

export default i18n
