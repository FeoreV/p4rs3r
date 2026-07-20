/**
 * HeadHunter (hh.ru) Playwright selectors configuration
 */
export const HH_SELECTORS = {
  loginUrl: 'https://hh.ru/account/login',
  profileUrl: 'https://hh.ru/applicant/resumes',
  mainMenuApplicant: '[data-qa="mainmenu_my_resumes"], [data-qa="mainmenu_applicant"], .supernova-icon-applicant, [data-qa="applicant-menu"], a[href*="/applicant/"]',
  loginFormInput: 'input[data-qa="login-input-username"], input[name="login"], [data-qa="account-login-form"]',
  applyButtonTop: 'a[data-qa="vacancy-response-link-top"], button[data-qa="vacancy-response-link-top"]',
  coverLetterTextarea: 'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
  mandatoryQuestionCard: '.vacancy-response-popup__question--required',
  submitButtonPopup: 'button[data-qa="vacancy-response-submit-popup"]',
  captchaFrame: 'iframe[src*="captcha"], .g-recaptcha, [data-qa="captcha"]',
  error403Or429: 'body:has-text("403 Forbidden"), body:has-text("429 Too Many Requests"), body:has-text("IP заблокирован")',
};

