// 목업 v8의 아이콘 정의를 그대로 옮겼습니다. 음식 종류별 SVG 글리프.
// ICONS[key] = [레이블, SVG 내부 마크업]
const ICONS={
grill:['고기구이','<g transform="translate(1.05 -1.37) scale(0.967)" stroke-width="2.48"><circle cx="32" cy="38" r="19"/><path d="M15 32h34M13 39h38M16 46h32"/><path d="M24 15c-3 3 3 5 0 9M32 12c-3 3 3 6 0 10M40 15c-3 3 3 5 0 9"/></g>'],
soup:['국밥·탕','<g transform="translate(2.88 4.70) scale(0.910)" stroke-width="2.64"><path d="M12 29h40c0 15-7 23-20 23S12 44 12 29Z"/><path d="M23 53h18M11 34h42"/><path d="M22 11c-8 7 8 10 0 17M33 7c-8 7 8 11 0 18M44 11c-8 7 8 10 0 17"/></g>'],
bapsang:['백반·한식','<g transform="translate(-1.01 -8.35) scale(1.048)" stroke-width="2.29"><path d="M8 34h26c0 9-6 14-13 14S8 43 8 34Z"/><path d="M12 34c1-6 5-9 9-9s8 3 9 9"/><ellipse cx="46" cy="28" rx="9" ry="5"/><ellipse cx="46" cy="44" rx="9" ry="5"/><path d="M10 54h44"/></g>'],
ramen:['라멘·면','<g transform="translate(3.55 6.22) scale(0.889)" stroke-width="2.70"><path d="M10 32h44c0 13-9 20-22 20S10 45 10 32Z"/><path d="M42 6 24 30M50 9 30 31"/><path d="M16 38c3 3 6-3 9 0s6-3 9 0 6-3 9 0 5-3 7-1"/></g>'],
pho:['쌀국수·동남아','<g transform="translate(3.23 5.48) scale(0.899)" stroke-width="2.67"><path d="M10 32h44c0 13-9 20-22 20S10 45 10 32Z"/><path d="M44 7 34 29M51 10 39 29"/><path d="M14 27c3-8 12-9 16-3-5 4-12 5-16 3Z"/><circle cx="23" cy="40" r="4"/></g>'],
sushi:['스시·오마카세','<g transform="translate(-2.67 -9.44) scale(1.083)" stroke-width="2.22"><rect x="12" y="31" width="40" height="13" rx="6.5"/><path d="M10 32c5-10 39-10 44 0"/><path d="M22 26l4 4M32 25l4 4M42 26l3 4"/><path d="M8 52h48"/></g>'],
skewer:['이자카야·꼬치','<g transform="translate(2.66 1.77) scale(0.889)" stroke-width="2.70"><path d="M10 56 54 12"/><circle cx="21" cy="45" r="6.5"/><circle cx="31" cy="35" r="6.5"/><circle cx="41" cy="25" r="6.5"/><path d="M50 30c4-3 6-1 6 2"/></g>'],
shell:['해산물·포차','<g transform="translate(-0.16 -0.66) scale(1.005)" stroke-width="2.39"><path d="M8 42c0-15 11-26 24-26s24 11 24 26Z"/><path d="M32 17v25M21 20l5 22M43 20l-5 22M13 29l9 13M51 29l-9 13"/><path d="M24 42h16v7H24Z"/></g>'],
fish:['생선구이','<g transform="translate(-0.50 -2.67) scale(1.083)" stroke-width="2.22"><path d="M6 32c9-11 23-13 35-4l13-9v26l-13-9c-12 9-26 7-35-4Z"/><circle cx="16" cy="30" r="1.8" fill="currentColor"/><path d="M27 25c2 4 2 10 0 14"/></g>'],
pasta:['파스타·양식','<g transform="translate(4.44 5.33) scale(0.889)" stroke-width="2.70"><ellipse cx="30" cy="44" rx="22" ry="8"/><path d="M18 41c1-9 22-9 24 0M23 41c1-5 13-5 14 0"/><path d="M50 8v26M46 8v7c0 4 8 4 8 0V8"/></g>'],
burger:['버거','<g transform="translate(2.16 1.23) scale(0.933)" stroke-width="2.57"><path d="M12 28c0-9 9-15 20-15s20 6 20 15Z"/><path d="M9 34h46"/><path d="M12 40h40"/><path d="M12 46c0 4 4 7 8 7h24c4 0 8-3 8-7Z"/><path d="M24 20h.01M32 18h.01M40 20h.01"/></g>'],
wok:['중식','<g transform="translate(4.77 4.77) scale(0.838)" stroke-width="2.86"><path d="M6 30h42c0 11-9 17-21 17S6 41 6 30Z"/><path d="M48 32h11"/><path d="M18 22c-3-4 3-6 0-11M28 22c-3-4 3-6 0-11M38 22c-3-4 3-6 0-11"/><path d="M14 54h28"/></g>'],
dumpling:['만두','<g transform="translate(0.00 -3.00) scale(1.000)" stroke-width="2.40"><path d="M8 42c0-13 11-21 24-21s24 8 24 21Z"/><path d="M17 27l3 6M25 23l1 7M34 22l-1 7M43 25l-3 6"/><path d="M6 49h52"/></g>'],
bread:['베이커리','<g transform="translate(0.00 1.19) scale(1.000)" stroke-width="2.40"><path d="M6 42c4-15 14-23 26-23s22 8 26 23c-6 2-10-1-12-6-5 6-23 6-28 0-2 5-6 8-12 6Z"/><path d="M25 22l4 15M39 22l-4 15"/></g>'],
cake:['디저트·카페','<g transform="translate(3.03 4.48) scale(0.966)" stroke-width="2.49"><path d="M10 48V31l38-13v30Z"/><path d="M10 39l38-11"/><path d="M8 48h44"/><path d="M38 9c-3 3 0 6 3 4"/></g>'],
};
const ICON_GROUP={grill:'kor',soup:'kor',bapsang:'kor',fish:'kor',shell:'kor',ramen:'jpn',sushi:'jpn',skewer:'jpn',pho:'asia',wok:'asia',dumpling:'asia',pasta:'west',burger:'west',bread:'cafe',cake:'cafe'};

export { ICONS, ICON_GROUP };
