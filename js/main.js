/**
 * @file main.js
 * @description This script contains all the client-side logic for the Neonatal Bilirubin Calculator.
 * It handles user input, calculates bilirubin thresholds based on AAP guidelines, and dynamically
 * updates the UI with results and recommendations.
 */
document.addEventListener('DOMContentLoaded', function () {
    /**
     * This is the main execution function that runs after the DOM is fully loaded.
     * It sets up all the variables by querying the DOM, attaches event listeners to the input fields,
     * and calls the `initialize` function to set the default state and perform the first calculation.
     */

    /**
     * Calculates the action threshold for neonatal jaundice based on a piecewise linear model.
     * This function determines the appropriate medical response (phototherapy or exchange transfusion)
     * based on the newborn's age, gestational age, bilirubin level, and risk factors.
     *
     * @param {string} treatmentType - The type of treatment guideline to use: 'phototherapy' or 'exchange'.
     * @param {boolean} hasRiskFactor - Whether neurotoxicity risk factors are present.
     * @param {number} gestationalAge - The gestational age of the infant in weeks.
     * @param {number} ageInHours - The postnatal age of the infant in hours.
     * @param {number} bilirubinLevel - The total serum bilirubin (TSB) level in mg/dL.
     * @returns {{threshold: number|null, needsAction: boolean, message: string}} An object containing the calculated threshold, whether action is needed, and a descriptive message. Returns null for threshold if inputs are out of range.
     */
    function getJaundiceGuideline(treatmentType, hasRiskFactor, gestationalAge, ageInHours, bilirubinLevel) {

        /**
         * Linearly interpolates a value between two points.
         * @param {number} t - The current time point.
         * @param {number} t1 - The start time of the segment.
         * @param {number} b1 - The bilirubin value at the start time.
         * @param {number} t2 - The end time of the segment.
         * @param {number} b2 - The bilirubin value at the end time.
         * @returns {number} The interpolated bilirubin value.
         */
        const interpolate = (t, t1, b1, t2, b2) => b1 + (t - t1) * ((b2 - b1) / (t2 - t1));

        // Data points for phototherapy and exchange transfusion thresholds based on AAP guidelines.
        const RAW_DATA = {
            phototherapy: {
                noRisk: {
                    '40': { points: [[0, 9], [12, 11], [24, 13.3], [36, 15.3], [60, 18.5], [72, 19.8], [96, 21.7], [336, 21.8]] },
                    '39': { points: [[0, 8.4], [12, 10.5], [24, 12.8], [36, 14.8], [60, 18.2], [72, 19.6], [96, 21.5], [336, 21.8]] },
                    '38': { points: [[0, 8], [12, 10], [24, 12.1], [48, 16], [60, 17.5], [96, 20.7], [336, 21.8]] },
                    '37': { points: [[0, 7.5], [12, 9.6], [24, 11.8], [48, 15.4], [60, 16.9], [96, 20], [336, 21.1]] },
                    '36': { points: [[0, 6.9], [12, 9], [24, 11], [48, 14.6], [60, 16.2], [72, 17.5], [96, 19.4], [336, 20.4]] },
                    '35': { points: [[0, 6.4], [12, 8.5], [36, 12.4], [48, 14.2], [60, 15.6], [72, 16.9], [96, 18.6], [336, 19.7]] },
                    range: [35, 40]
                },
                withRisk: {
                    '38': { points: [[0, 6.3], [24, 10.5], [72, 16.5], [96, 18.3], [336, 18.3]] },
                    '37': { points: [[0, 5.9], [12, 8], [24, 10], [48, 13.6], [60, 14.9], [72, 16.1], [96, 17.9], [336, 18.3]] },
                    '36': { points: [[0, 5.4], [24, 9.4], [60, 14.2], [96, 17], [336, 18.3]] },
                    '35': { points: [[0, 4.9], [24, 8.9], [60, 13.5], [72, 14.6], [96, 16.2], [336, 17.4]] },
                    range: [35, 38]
                }
            },
            exchange: {
                noRisk: {
                    '38': { points: [[24, 21.4], [48, 24], [72, 25.9], [96, 27], [336, 27]] },
                    '37': { points: [[24, 20.3], [48, 23.1], [72, 25.3], [96, 26.5], [336, 27]] },
                    '36': { points: [[24, 19], [48, 21.9], [72, 24], [96, 25.5], [336, 27]] },
                    '35': { points: [[24, 18], [48, 20.6], [72, 22.8], [96, 24.5], [336, 26.3]] },
                    range: [35, 38]
                },
                withRisk: {
                    '38': { points: [[24, 17.8], [48, 20.1], [72, 22.1], [96, 23.5], [336, 23.5]] },
                    '37': { points: [[24, 17.2], [48, 19.7], [72, 21.7], [96, 23.1], [336, 23.5]] },
                    '36': { points: [[24, 16.6], [48, 19], [72, 20.8], [96, 22.1], [336, 23.5]] },
                    '35': { points: [[24, 16], [48, 18.4], [72, 20.1], [96, 21], [336, 22.9]] },
                    range: [35, 38]
                }
            }
        };

        // --- 1. Select correct dataset ---
        if (!RAW_DATA[treatmentType]) {
            return { threshold: null, message: "خطا: نوع درمان باید 'phototherapy' یا 'exchange' باشد." };
        }
        const riskKey = hasRiskFactor ? 'withRisk' : 'noRisk';
        const dataSet = RAW_DATA[treatmentType][riskKey];

        // --- 2. Select correct gestational age data ---
        let ageData;
        const [minAge, maxAge] = dataSet.range;
        if (gestationalAge >= maxAge) {
            ageData = dataSet[maxAge.toString()];
        } else if (dataSet[gestationalAge]) {
            ageData = dataSet[gestationalAge];
        } else {
            // Handle 34 weeks for with-risk phototherapy as 35 weeks
            if (treatmentType === 'phototherapy' && hasRiskFactor && gestationalAge === 34) {
                 ageData = dataSet['35'];
            } else {
                 return { threshold: null, message: `خطا: برای این نمودار، سن حاملگی باید در محدوده تعریف شده باشد.` };
            }
        }

        // --- 3. Find the correct segment and calculate threshold ---
        const { points } = ageData;
        if (ageInHours < points[0][0]) {
             return { threshold: null, message: `نوزاد (${ageInHours} ساعت) کوچکتر از حداقل سن در نمودار (${points[0][0]} ساعت) است و نیاز به توجه ویژه دارد.` };
        }

        let threshold;
        for (let i = 0; i < points.length - 1; i++) {
            const [t1, b1] = points[i];
            const [t2, b2] = points[i + 1];
            if (ageInHours >= t1 && ageInHours <= t2) {
                threshold = interpolate(ageInHours, t1, b1, t2, b2);
                break;
            }
        }
         if (threshold === undefined) { // If age is beyond the last point
            const [last_t, last_b] = points[points.length - 1];
            const [second_last_t, second_last_b] = points[points.length - 2];
            threshold = interpolate(ageInHours, second_last_t, second_last_b, last_t, last_b);
        }


        const roundedThreshold = parseFloat(threshold.toFixed(2));
        const needsAction = bilirubinLevel >= roundedThreshold;

        // --- 4. Generate final message ---
        const treatmentText = treatmentType === 'phototherapy' ? 'فتوتراپی' : 'تعویض خون';
        const riskText = hasRiskFactor ? 'با ریسک فاکتور' : 'بدون ریسک فاکتور';

        const message = `نوزاد ${gestationalAge} هفته در سن ${ageInHours} ساعت:
    آستانه اقدام: ${roundedThreshold} mg/dL
    بیلی‌روبین بیمار: ${bilirubinLevel} mg/dL
    نتیجه: ${needsAction ? 'نیاز به اقدام دارد.' : 'نیاز به اقدام ندارد.'}`;

        return {
            threshold: roundedThreshold,
            needsAction: needsAction,
            message: message
        };
    }
    const dobPicker = document.getElementById('dob-datepicker');
    const birthHourInput = document.getElementById('birth-hour');
    const useLabTimeCheckbox = document.getElementById('use-lab-time-checkbox');
    const labTimeSection = document.getElementById('lab-time-section');
    const labDatePicker = document.getElementById('lab-datepicker');
    const labHourInput = document.getElementById('lab-hour');
    const ageDisplay = document.getElementById('age-display');
    const ageLabel = document.getElementById('age-label');
    const ageHourDisplay = document.getElementById('age-hour-display');
    const gaControl = document.getElementById('ga-segmented-control');
    const bilirubinInput = document.getElementById('bilirubin-input');
    const riskFactorCheckbox = document.getElementById('risk-factors');
    const kernicterusSignsCheckbox = document.getElementById('kernicterus-signs');
    const resultArea = document.getElementById('result-area');

    // --- Helpers ---
    /**
     * Converts a number to a string with Persian (Farsi) digits.
     * Handles both integers and floating-point numbers, and also converts the decimal point
     * to a Persian decimal separator ('٫').
     * @param {number|string|null|undefined} n The number or string to be converted.
     * @returns {string} The number represented with Persian digits. Returns a hyphen '-' if the input is null or undefined.
     */
    function toPersianNum(n) {
        if (n === null || n === undefined) return '-';
        const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        return n.toString().replace(/\d/g, x => farsiDigits[x]).replace(/\./g, '٫');
    }

    /**
     * Converts a string containing Persian or Arabic digits to a string with standard English digits.
     * It also handles the Persian decimal separator ('٫'), converting it to a standard period ('.').
     * This is used to process user input before performing calculations.
     * @param {string|null|undefined} str The string containing Persian/Arabic numerals to be converted.
     * @returns {string} The converted string with standard English digits. Returns an empty string if the input is null or undefined.
     */
    function toEnglishNum(str) {
        if (str === null || str === undefined) return '';
        const persianDigits = /[\u06F0-\u06F9]/g;
        const arabicDigits = /[\u0660-\u0669]/g;
        const persianDecimalSeparator = new RegExp('٫', 'g');
        return str.toString()
            .replace(persianDecimalSeparator, '.')
            .replace(persianDigits, c => c.charCodeAt(0) - 0x06F0)
            .replace(arabicDigits, c => c.charCodeAt(0) - 0x0660);
    }

    // --- State Object (Single Source of Truth) ---
    const state = {
        birthDate: null,
        birthHour: null,
        labDate: null,
        labHour: null,
        useLabTime: false,
        ageInHours: null,
        totalBilirubin: null, // Default to null, placeholder will be shown
        gestationalAge: 38,
        hasRiskFactors: true,
        hasKernicterusSigns: false,
    };

    // --- Main Calculation & UI Update Function ---
    /**
     * Gathers all user inputs, updates the central state object, calculates the infant's age,
     * and triggers the main guideline logic to update the UI. This function serves as the primary
     * orchestrator for the calculator's logic whenever an input changes.
     */
    function recalculateAndRender() {
        state.gestationalAge = parseInt(gaControl.querySelector('.active')?.dataset.ga || '38', 10);
        state.hasRiskFactors = riskFactorCheckbox.checked;
        state.hasKernicterusSigns = kernicterusSignsCheckbox.checked;

        if (state.birthDate && state.birthHour !== null) {
            const birthDateTime = new Date(state.birthDate);
            birthDateTime.setHours(state.birthHour, 0, 0, 0);

            let evaluationTime = new Date();
            if (state.useLabTime && state.labDate && state.labHour !== null) {
                const labDateTime = new Date(state.labDate);
                labDateTime.setHours(state.labHour, 0, 0, 0);
                evaluationTime = labDateTime;
            }

            const ageInMillis = evaluationTime.getTime() - birthDateTime.getTime();
            state.ageInHours = Math.max(0, Math.floor(ageInMillis / (1000 * 60 * 60)));

            const days = Math.floor(state.ageInHours / 24);
            const hoursPart = state.ageInHours % 24;
            ageDisplay.innerHTML = `<span id="age-hour-display" class="age-hour">${toPersianNum(state.ageInHours)}H</span> ${toPersianNum(days)} روز و ${toPersianNum(hoursPart)} ساعت`;
        } else {
            state.ageInHours = null;
            ageDisplay.innerHTML = `<span id="age-hour-display" class="age-hour"></span> -`;
        }

        runGuidelineLogic();
    }

    // --- Core Guideline Logic ---
    /**
     * Executes the core logic for determining treatment recommendations based on the current state.
     * It handles special cases like kernicterus signs or infants younger than 24 hours,
     * calls the `getJaundiceGuideline` function for phototherapy and exchange thresholds,
     * and renders the final recommendations and results in the UI.
     */
    function runGuidelineLogic() {
        // OVERRIDE: If kernicterus signs are present, immediate action is required.
        if (state.hasKernicterusSigns) {
            const recommendationHtml = `<div class="recommendation-title">توصیه: تعویض خون فوری</div><ul class="recommendation-list"><li>وجود علائم نوروتوکسیسیتی (کرن‌ایکتروس) یک اورژانس پزشکی است.</li><li>مشاوره فوری با NICU و شروع درمان بدون در نظر گرفتن سطح بیلی‌روبین.</li></ul>`;
            resultArea.innerHTML = `<h2 class="results-title">اقدام اورژانسی:</h2><div class="recommendation high-risk">${recommendationHtml}</div>`;
            return;
        }

        if (state.ageInHours === null || state.gestationalAge === null) {
            resultArea.innerHTML = '';
            return;
        }

        // Rule: Do not show recommendations for infants < 24 hours old.
        if (state.ageInHours < 24) {
            resultArea.innerHTML = `<h2 class="results-title">توجه:</h2><div class="recommendation medium-risk" style="text-align: center;">این گایدلاین برای نوزادان با سن کمتر از ۲۴ ساعت کاربرد ندارد.</div>`;
            return;
        }

        // Use 8.0 as the default bilirubin value if the input is empty.
        const bilirubinForCalc = state.totalBilirubin === null ? 8.0 : state.totalBilirubin;

        const photoResult = getJaundiceGuideline('phototherapy', state.hasRiskFactors, state.gestationalAge, state.ageInHours, bilirubinForCalc);
        const exchangeResult = getJaundiceGuideline('exchange', state.hasRiskFactors, state.gestationalAge, state.ageInHours, bilirubinForCalc);

        // Check for errors or out-of-range messages from the new function
        if (photoResult.threshold === null || exchangeResult.threshold === null) {
            // Display the more specific message from the guideline function
            const message = photoResult.message || exchangeResult.message;
            resultArea.innerHTML = `<h2 class="results-title">توجه:</h2><div class="recommendation medium-risk" style="text-align: center;">${message}</div>`;
            return;
        }

        const phototherapyThreshold = photoResult.threshold;
        const exchangeThreshold = exchangeResult.threshold;
        const escalationThreshold = parseFloat((exchangeThreshold - 2).toFixed(2));

        let recommendationHtml = '';
        let recommendationClass = 'no-risk';
        const difference = phototherapyThreshold - state.totalBilirubin;

        if (state.totalBilirubin >= exchangeThreshold) {
            recommendationClass = 'high-risk';
            recommendationHtml = `<div class="recommendation-title">توصیه: تعویض خون فوری</div><ul class="recommendation-list"><li>مشاوره فوری با NICU</li><li>شروع فتوتراپی فشرده و هیدراتاسیون</li><li>آماده‌سازی برای تعویض خون</li></ul>`;
        } else if (state.totalBilirubin >= escalationThreshold) {
            recommendationClass = 'medium-risk';
            recommendationHtml = `<div class="recommendation-title">توصیه: فتوتراپی فشرده (Intensive)</div><ul class="recommendation-list"><li>شروع فتوتراپی فشرده و هیدراتاسیون</li><li>چک بیلی‌روبین هر ۸ ساعت</li><li>بررسی انتقال به مرکز مناسب در صورت عدم پاسخ مناسب</li></ul>`;
        } else if (state.totalBilirubin >= phototherapyThreshold) {
            recommendationClass = 'low-risk';
            recommendationHtml = `<div class="recommendation-title">توصیه: فتوتراپی فشرده (Intensive)</div><ul class="recommendation-list"><li>چک بیلی‌روبین هر ۸ ساعت</li></ul>`;
        } else if (difference <= 0.5) { // از 0.5 واحد کمتر تا خود آستانه
            recommendationClass = 'low-risk';
            recommendationHtml = `<div class="recommendation-title">توصیه: فتوتراپی فشرده (Intensive)</div><ul class="recommendation-list"><li>چک بیلی‌روبین هر ۸ ساعت</li></ul>`;
        } else if (difference <= 2) { // از 2 واحد کمتر تا 0.5 واحد کمتر
            recommendationClass = 'low-risk';
            recommendationHtml = `<div class="recommendation-title">توصیه: فتوتراپی دوگانه (Double)</div><ul class="recommendation-list"><li>چک بیلی‌روبین هر ۱۲ ساعت</li></ul>`;
        } else if (difference <= 3) { // از 3 واحد کمتر تا 2 واحد کمتر
             recommendationClass = 'low-risk';
             recommendationHtml = `<div class="recommendation-title">توصیه: فتوتراپی ساده (Single)</div><ul class="recommendation-list"><li>چک بیلی‌روبین هر ۱۲ ساعت</li></ul>`;
        } else { // بیشتر از 3 واحد کمتر از آستانه
            let followUpText = 'قضاوت بالینی';
            if (difference < 3.5) { // این منطق برای سازگاری با حالت‌های قبلی است
                followUpText = 'توصیه: TSB یا TcB در ۴ تا ۲۴ ساعت.';
            } else if (difference < 5.5) {
                followUpText = 'توصیه: TSB یا TcB در ۱ تا ۲ روز.';
            } else if (difference < 7.0) {
                followUpText = `توصیه: ${state.ageInHours < 72 ? 'پیگیری طی ۲ روز' : 'قضاوت بالینی'}.`;
            } else {
                followUpText = `توصیه: ${state.ageInHours < 72 ? 'پیگیری طی ۳ روز' : 'قضاوت بالینی'}.`;
            }
            recommendationHtml = `<div class="recommendation-title">نیاز به اقدام فوری نیست (اختلاف: ${toPersianNum(difference.toFixed(1))})</div><div class="recommendation-detail">${followUpText}</div>`;
        }

        resultArea.innerHTML = `<h2 class="results-title">نتایج و توصیه‌ها:</h2><div class="results-grid"><div class="result-card"><div class="result-card-icon-wrapper icon-phototherapy"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg></div><div class="result-card-content"><span class="result-card-value">${toPersianNum(phototherapyThreshold)}</span><span class="result-card-label">آستانه فتوتراپی</span></div></div><div class="result-card"><div class="result-card-icon-wrapper icon-escalation"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></div><div class="result-card-content"><span class="result-card-value">${toPersianNum(escalationThreshold)}</span><span class="result-card-label">آستانه تشدید مراقبت</span></div></div><div class="result-card"><div class="result-card-icon-wrapper icon-exchange"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-5.5-5.5c-2 1.5-4 3.5-5.5 5.5S5 13 5 15a7 7 0 0 0 7 7z"></path></svg></div><div class="result-card-content"><span class="result-card-value">${toPersianNum(exchangeThreshold)}</span><span class="result-card-label">آستانه تعویض خون</span></div></div></div><div class="recommendation ${recommendationClass}">${recommendationHtml}</div>`;
    }

    // --- Event Listeners & Initializers ---
    /**
     * Sets up advanced event handling for a numeric input field.
     * This includes validation, conversion between Persian and English numerals,
     * and interaction via mouse wheel and touch-drag gestures for incrementing/decrementing the value.
     * @param {HTMLInputElement} input - The input element to attach the listeners to.
     * @param {string} stateKey - The key in the global `state` object where this input's value is stored.
     * @param {object} [options={}] - Configuration options for the input.
     * @param {number} [options.max] - The maximum allowed value.
     * @param {number} [options.min=0] - The minimum allowed value.
     * @param {number} [options.step=1] - The increment/decrement step for wheel/touch events.
     * @param {boolean} [options.isFloat=false] - Whether the number is a floating-point value.
     * @param {number} [options.startValue=0] - The default value to use for calculations if the current state value is null.
     */
    function setupNumericInput(input, stateKey, options = {}) {
        const { max, min = 0, step = 1, isFloat = false, startValue = 0 } = options;
        const validateAndSet = (newValue) => {
            let num;
            const englishValue = toEnglishNum(newValue.toString());
            const sanitized = englishValue.replace(isFloat ? /[^0-9.]/g : /[^0-9]/g, '');
            if (sanitized === '' || sanitized === '.') { state[stateKey] = null; return null; }
            num = isFloat ? parseFloat(sanitized) : parseInt(sanitized, 10);
            if (isNaN(num)) { state[stateKey] = null; return null; }
            if (max !== undefined && num > max) num = max;
            if (min !== undefined && num < min) num = min;
            if (isFloat) { num = parseFloat(num.toFixed(1)); }
            state[stateKey] = num;
            return num;
        };
        input.addEventListener('blur', () => {
            validateAndSet(input.value);
            if (state[stateKey] !== null) {
                input.value = toPersianNum(state[stateKey]);
            } else {
                input.value = '';
            }
            recalculateAndRender();
        });
        input.addEventListener('focus', () => {
            if (state[stateKey] !== null) { input.value = state[stateKey]; }
        });
        input.addEventListener('input', () => {
            validateAndSet(input.value);
            recalculateAndRender();
        });
        input.addEventListener('wheel', (e) => {
            e.preventDefault();
            let currentValue = state[stateKey] || startValue;
            currentValue += (e.deltaY < 0) ? step : -step;
            const num = validateAndSet(currentValue);
            input.value = (num !== null) ? toPersianNum(num) : '';
            recalculateAndRender();
        });

        let touchStartY = 0;
        input.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        input.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            if (Math.abs(deltaY) > 15) { // Threshold to trigger change
                let currentValue = state[stateKey] || startValue;
                currentValue += (deltaY > 0) ? step : -step;
                const num = validateAndSet(currentValue);
                input.value = (num !== null) ? toPersianNum(num) : '';
                recalculateAndRender();
                touchStartY = touchY; // Reset start position
            }
        }, { passive: false });
    }
    gaControl.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            gaControl.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            recalculateAndRender();
        }
    });
    useLabTimeCheckbox.addEventListener('change', () => {
        state.useLabTime = useLabTimeCheckbox.checked;
        labTimeSection.classList.toggle('visible', state.useLabTime);
        ageLabel.textContent = state.useLabTime ? 'سن نوزاد هنگام آزمایش' : 'سن نوزاد';
        recalculateAndRender();
    });
    dobPicker.addEventListener('change', (e) => {
        const [y, m, d] = e.detail.gregorian;
        state.birthDate = new Date(y, m - 1, d);
        recalculateAndRender();
    });
    labDatePicker.addEventListener('change', (e) => {
        const [y, m, d] = e.detail.gregorian;
        state.labDate = new Date(y, m - 1, d);
        recalculateAndRender();
    });
    riskFactorCheckbox.addEventListener('change', recalculateAndRender);
    kernicterusSignsCheckbox.addEventListener('change', recalculateAndRender);
    setupNumericInput(birthHourInput, 'birthHour', { max: 23 });
    setupNumericInput(labHourInput, 'labHour', { max: 23 });
    setupNumericInput(bilirubinInput, 'totalBilirubin', { isFloat: true, step: 0.1, min: 1, max: 28, startValue: 8 });

    // --- Initializer ---
    /**
     * Initializes the calculator application when the page loads.
     * This function sets up the default state, localizes numbers to Persian,
     * sets the default gestational age, and initializes the date pickers
     * and time inputs to the current date and time. It then triggers the first calculation.
     */
    function initialize() {
        gaControl.querySelectorAll('button').forEach(button => {
            button.textContent = toPersianNum(button.textContent);
        });
        const activeGA = gaControl.querySelector(`[data-ga='${state.gestationalAge}']`);
        if (activeGA) {
            activeGA.classList.add('active');
        } else {
            const firstButton = gaControl.querySelector('button');
            if (firstButton) {
                firstButton.classList.add('active');
                state.gestationalAge = parseInt(firstButton.dataset.ga, 10);
            }
        }
        // bilirubinInput.value is now handled by the placeholder
        customElements.whenDefined('persian-datepicker-element').then(() => {
            const today = new Date();
            const options = { year: 'numeric', month: 'numeric', day: 'numeric', calendar: 'persian' };
            const persianDateString = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options).format(today);
            const parts = persianDateString.split('/');
            if (parts.length === 3) {
                const [year, month, day] = parts.map(p => parseInt(p, 10));
                dobPicker.setValue(year, month, day);
                state.birthDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                labDatePicker.setValue(year, month, day);
                state.labDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            }
            const currentHour = today.getHours();
            state.birthHour = currentHour;
            birthHourInput.value = toPersianNum(currentHour);
            state.labHour = currentHour;
            labHourInput.value = toPersianNum(currentHour);
            recalculateAndRender();
        });
    }
    initialize();
});