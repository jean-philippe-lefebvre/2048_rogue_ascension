'use strict';

// "Gravure fine" icon set: 24px grid, 1.5px round stroke in currentColor, soft 20-40% fills for volume.
// Values are trusted markup authored here, never user input.
const ICON_FILL = 'fill="currentColor" stroke="none"';
const Icons = {
  shapes: {
    // ── Rooms ──
    sword: '<path d="M12 2.5 14 5v10h-4V5z"/><path d="M12 6v8" opacity=".5"/><path d="M7 15h10M12 15v4.5"/><circle cx="12" cy="21" r="1.3"/>',
    skull: `<path d="M12 3C7.6 3 5 6.1 5 10c0 2.4 1 4.1 2.5 5.1V18h9v-2.9C18 14.1 19 12.4 19 10c0-3.9-2.6-7-7-7z"/><circle cx="9.2" cy="10.8" r="1.5" ${ICON_FILL} fill-opacity=".4"/><circle cx="14.8" cy="10.8" r="1.5" ${ICON_FILL} fill-opacity=".4"/><path d="M12 13.2 11 15h2zM10 18v2.5M12 18v2.5M14 18v2.5M8.8 20.5h6.4"/>`,
    campfire: `<path d="M4.5 20.5l15-3M4.5 17.5l15 3"/><path d="M12 15.5c-2.5 0-4-1.5-4-3.7 0-2.2 1.5-3.2 2.1-5.3.9 1 1.3 2 1.2 3 1.1-1 2.2-2.9 1.9-6.3 2.3 1.6 4.8 4.4 4.8 8.2 0 2.6-1.8 4.1-6 4.1z"/><path d="M12 15.5c-1.1 0-1.8-.7-1.8-1.7 0-1 .8-1.6 1.5-2.7.8 1 2 1.7 2 2.8 0 1-.6 1.6-1.7 1.6z" ${ICON_FILL} fill-opacity=".45"/>`,
    question: `<path d="M6 21V10a6 6 0 0 1 12 0v11M4 21h16"/><path d="M6 21V10a6 6 0 0 1 12 0v11z" ${ICON_FILL} fill-opacity=".12"/><path d="M10 10.3a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.6v.4"/><circle cx="12" cy="16.9" r=".7" ${ICON_FILL}/>`,
    eye: `<path d="M2.5 12C5.5 7.2 8.6 5.5 12 5.5s6.5 1.7 9.5 6.5c-3 4.8-6.1 6.5-9.5 6.5S5.5 16.8 2.5 12z"/><circle cx="12" cy="12" r="3.6"/><path d="M12 9.2c.9 1.1.9 4.5 0 5.6-.9-1.1-.9-4.5 0-5.6z" ${ICON_FILL}/><path d="M12 1.8v1.8M5.4 3.4l1.1 1.5M18.6 3.4l-1.1 1.5"/>`,

    // ── Relics: common ──
    entropy: `<path d="M12 2.8 20 7.3v9.4L12 21.2 4 16.7V7.3z"/><path d="M4 7.3l8 4.5 8-4.5M12 11.8v9.4"/><path d="M12 2.8 20 7.3 12 11.8 4 7.3z" ${ICON_FILL} fill-opacity=".18"/><circle cx="12" cy="7.3" r=".9" ${ICON_FILL}/><circle cx="7" cy="12.2" r=".9" ${ICON_FILL}/><circle cx="9.2" cy="16.6" r=".9" ${ICON_FILL}/><circle cx="16" cy="14.4" r=".9" ${ICON_FILL}/>`,
    greed: `<path d="M9.4 7h5.2c3.3 2.2 5.4 5.9 5.4 9.1 0 3-2.6 4.4-8 4.4s-8-1.4-8-4.4C4 12.9 6.1 9.2 9.4 7z"/><path d="M9.4 7 8 3.6c1.4.6 2.6.6 4 0 1.4.6 2.6.6 4 0L14.6 7M8.8 7h6.4"/><path d="M12 11.6l2.2 2.9-2.2 2.9-2.2-2.9z" ${ICON_FILL} fill-opacity=".45"/>`,
    haste: `<path d="M13.5 2.5 5.5 13.5H11l-1.2 8 8.7-11.2H13z"/><path d="M13.5 2.5 5.5 13.5H11l-1.2 8 8.7-11.2H13z" ${ICON_FILL} fill-opacity=".2"/>`,
    shield: `<path d="M12 2.8 19.5 5.5v6c0 4.8-3.1 8-7.5 9.9C7.6 19.5 4.5 16.3 4.5 11.5v-6z"/><path d="M12 2.8v18.6M5 10.5h14" opacity=".55"/><path d="M12 2.8 4.5 5.5v5H12z" ${ICON_FILL} fill-opacity=".25"/><path d="M12 10.5h7c-.3 4.9-3.2 8.3-7 10.9z" ${ICON_FILL} fill-opacity=".25"/>`,
    sprout: `<path d="M12 21v-8M8 21h8"/><path d="M12 13C12 9 9.5 6.5 5 6.5c0 4.2 2.6 6.5 7 6.5z"/><path d="M12 13C12 9 9.5 6.5 5 6.5c0 4.2 2.6 6.5 7 6.5z" ${ICON_FILL} fill-opacity=".3"/><path d="M12 11c0-4 2.6-6.5 7-6.5 0 4.2-2.6 6.5-7 6.5z"/>`,
    collector: `<ellipse cx="10" cy="7.8" rx="5" ry="1.8"/><path d="M5 7.8v9.7c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V7.8M5 11c0 1 2.2 1.8 5 1.8s5-.8 5-1.8M5 14.2c0 1 2.2 1.8 5 1.8s5-.8 5-1.8"/><ellipse cx="10" cy="7.8" rx="5" ry="1.8" ${ICON_FILL} fill-opacity=".25"/><circle cx="18" cy="16.5" r="3.5"/><path d="M18 14.9l1.2 1.6-1.2 1.6-1.2-1.6z" ${ICON_FILL} fill-opacity=".5"/>`,
    compass: `<circle cx="12" cy="5.2" r="1.8"/><path d="M12 2v1.4M11 6.8 6 20.5M13 6.8l5 13.7M7.3 16.6a9 9 0 0 0 9.4 0"/><path d="M6 20.5l-.6 1.5M18 20.5l.6 1.5" opacity=".6"/>`,

    // ── Relics: rare ──
    echo: `<circle cx="12" cy="10" r="6.5"/><circle cx="12" cy="10" r="3" opacity=".5"/><path d="M8.8 7.8a4 4 0 0 1 2.4-1.9"/><path d="M8 16.3h8l1.5 4.2h-11z"/><path d="M8 16.3h8l1.5 4.2h-11z" ${ICON_FILL} fill-opacity=".25"/><circle cx="12" cy="10" r="1" ${ICON_FILL}/>`,
    magnet: `<path d="M6 3.5v8a6 6 0 0 0 12 0v-8h-3.5v8a2.5 2.5 0 0 1-5 0v-8z"/><path d="M6 3.5h3.5V7H6zM14.5 3.5H18V7h-3.5z" ${ICON_FILL} fill-opacity=".4"/><path d="M6 7h3.5M14.5 7H18"/><path d="M3 12.5H1.8M22.2 12.5H21M4 16.5l-1 .6M20 16.5l1 .6" opacity=".55"/>`,
    tide: `<path d="M4 12c0-4.4 3.4-8 7.6-8 2.9 0 5 1.6 5 3.8 0 1.6-1.2 2.7-2.7 2.7-1.2 0-2-.8-2-1.9"/><path d="M2.5 15.5c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2M2.5 19.5c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/><path d="M4 12c0-4.4 3.4-8 7.6-8 2.9 0 5 1.6 5 3.8 0 1.6-1.2 2.7-2.7 2.7-1.2 0-2-.8-2-1.9-2.3 0-3.9 1.4-3.9 3.4z" ${ICON_FILL} fill-opacity=".18"/>`,
    blade: `<path d="M20.5 3.5l-1 4.3-8.3 8.3-3.3-3.3 8.3-8.3z"/><path d="M20.5 3.5l-1 4.3-8.3 8.3-3.3-3.3 8.3-8.3z" ${ICON_FILL} fill-opacity=".2"/><path d="M19.8 4.2l-9.6 9.6" opacity=".5"/><path d="M6.3 11.7l6 6M8.6 15.4l-3.8 3.8"/><circle cx="4" cy="20" r="1.2"/>`,
    focus: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="5" ${ICON_FILL} fill-opacity=".15"/><circle cx="12" cy="12" r="1.6" ${ICON_FILL}/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>`,
    recycle: `<path d="M19.5 9A8 8 0 0 0 5.2 7.5M4.5 15a8 8 0 0 0 14.3 1.5"/><path d="M5 3.5v4h4M19 20.5v-4h-4"/><circle cx="12" cy="12" r="2.2" ${ICON_FILL} fill-opacity=".35"/>`,

    // ── Relics: epic ──
    crystal: `<path d="M7 4h10l4 5.5L12 21 3 9.5z"/><path d="M3 9.5h18M9 9.5 12 21l3-11.5M7 4l2 5.5M17 4l-2 5.5" opacity=".6"/><path d="M7 4h10l-2 5.5H9z" ${ICON_FILL} fill-opacity=".3"/>`,
    mirror: `<ellipse cx="12" cy="9" rx="6" ry="6.5"/><ellipse cx="12" cy="9" rx="4.3" ry="4.8" ${ICON_FILL} fill-opacity=".15"/><path d="M9.2 7.4a3.6 3.6 0 0 1 2.3-2.3"/><path d="M10.8 15.4 10.3 20.5a1.7 1.7 0 0 0 3.4 0l-.5-5.1"/>`,
    hourglass: `<path d="M6 3h12M6 21h12M7.5 3c0 4.5 1.5 6 4.5 9-3 3-4.5 4.5-4.5 9M16.5 3c0 4.5-1.5 6-4.5 9 3 3 4.5 4.5 4.5 9"/><path d="M9 6.5h6c-.6 1.5-1.6 2.7-3 4-1.4-1.3-2.4-2.5-3-4zM8.6 19.8c.6-2 1.8-3 3.4-3.6 1.6.6 2.8 1.6 3.4 3.6z" ${ICON_FILL} fill-opacity=".35"/><path d="M12 12.5v3" opacity=".5"/>`,
    vortex: `<path d="M12 12.5c0-1.1.9-1.8 1.9-1.6 1.4.3 2 1.9 1.4 3.2-.9 1.9-3.4 2.4-5.2 1.3-2.4-1.5-2.8-4.8-1.1-7 2.2-2.8 6.5-3.1 9.2-.8 3.2 2.8 3.2 7.8.3 10.7-3.4 3.3-9 3.2-12.3-.3"/><circle cx="12.6" cy="12.6" r="1" ${ICON_FILL}/>`,
    crown: `<path d="M3.5 8l4.3 4.2L12 5l4.2 7.2L20.5 8 18.8 18H5.2z"/><path d="M3.5 8l4.3 4.2L12 5l4.2 7.2L20.5 8 18.8 18H5.2z" ${ICON_FILL} fill-opacity=".2"/><path d="M5.2 18h13.6v2.5H5.2z"/><circle cx="3.5" cy="6.6" r="1"/><circle cx="12" cy="3.4" r="1"/><circle cx="20.5" cy="6.6" r="1"/><circle cx="12" cy="14.5" r="1.1" ${ICON_FILL}/>`,
    dupli: `<path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9"/><path d="M8.5 6h7M9.6 9.2h4.8M9.6 14.8h4.8M8.5 18h7" opacity=".55"/>`,

    // ── Relics: legendary ──
    phoenix: `<path d="M12 21c-2.6-1.6-3.8-4-3.2-6.8.4 1.2 1.2 2 2.2 2.2-.8-3 .6-5.4 2.6-7-.2 2 .6 3.4 2 4.2.8-1.2.8-2.6.4-4 2 1.8 2.6 4.2 1.8 6.6-.8 2.4-3 4.2-5.8 4.8z"/><path d="M12 21c-2.6-1.6-3.8-4-3.2-6.8.4 1.2 1.2 2 2.2 2.2-.8-3 .6-5.4 2.6-7-.2 2 .6 3.4 2 4.2.8-1.2.8-2.6.4-4 2 1.8 2.6 4.2 1.8 6.6-.8 2.4-3 4.2-5.8 4.8z" ${ICON_FILL} fill-opacity=".25"/><path d="M9.3 12.4C6.6 12 4.2 10 2.6 6.4c2.2.9 3.9 1 5.3.5M14.8 12.4c2.7-.4 5.1-2.4 6.6-6-2.2.9-3.9 1-5.3.5M11.6 8.3c-.5-1.5-.3-3 .9-4.6.2 1.3.8 2.1 1.6 2.6"/>`,
    transmute: `<path d="M9.5 3h5M10.3 3v5.5L5 18.3A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.7L13.7 8.5V3"/><path d="M7.4 14h9.2l2.4 4.3a1.8 1.8 0 0 1-1.6 2.7H6.6A1.8 1.8 0 0 1 5 18.3z" ${ICON_FILL} fill-opacity=".28"/><circle cx="10.4" cy="17.4" r=".8"/><circle cx="13.6" cy="16" r=".6"/><circle cx="12.3" cy="11.4" r=".5"/>`,
    darkpact: `<circle cx="12" cy="12" r="9"/><path d="M12 3.5 17 18.9 3.9 9.4h16.2L7 18.9z"/><circle cx="12" cy="12" r="2.4" ${ICON_FILL} fill-opacity=".35"/>`,
    eclipse: `<circle cx="12" cy="12" r="6"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" opacity=".6"/><circle cx="13.8" cy="10.6" r="4.6"/><circle cx="13.8" cy="10.6" r="4.6" ${ICON_FILL} fill-opacity=".4"/>`,
    berserker: `<path d="M12 2.5v19"/><path d="M12 5c-3.5-1.5-6.5-.8-8 1.5 1 2.6 1 5.4 0 8 1.5 2.3 4.5 3 8 1.5zM12 5c3.5-1.5 6.5-.8 8 1.5-1 2.6-1 5.4 0 8-1.5 2.3-4.5 3-8 1.5z"/><path d="M12 5c-3.5-1.5-6.5-.8-8 1.5 1 2.6 1 5.4 0 8 1.5 2.3 4.5 3 8 1.5zM12 5c3.5-1.5 6.5-.8 8 1.5-1 2.6-1 5.4 0 8-1.5 2.3-4.5 3-8 1.5z" ${ICON_FILL} fill-opacity=".2"/><path d="M10.5 21.5h3"/>`,

    // ── Curses ──
    web: `<path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7"/><path d="M12 6.5c1.4.8 2.5 1 3.9 1.6.3 1.5.9 2.6 1.6 3.9-.7 1.3-1.3 2.4-1.6 3.9-1.4.6-2.5.8-3.9 1.6-1.4-.8-2.5-1-3.9-1.6-.3-1.5-.9-2.6-1.6-3.9.7-1.3 1.3-2.4 1.6-3.9 1.4-.6 2.5-.8 3.9-1.6z" opacity=".75"/><path d="M12 3.5c2.1 1.2 3.9 1.6 6 2.5.9 2.1 1.3 3.9 2.5 6-1.2 2.1-1.6 3.9-2.5 6-2.1.9-3.9 1.3-6 2.5-2.1-1.2-3.9-1.6-6-2.5-.9-2.1-1.3-3.9-2.5-6 1.2-2.1 1.6-3.9 2.5-6 2.1-.9 3.9-1.3 6-2.5z" opacity=".45"/>`,
    fragile: `<g transform="rotate(-45 12 12)"><path d="M7 10.5h10M7 13.5h10"/><path d="M7 10.5a1.8 1.8 0 1 0-2.4-1.9A1.8 1.8 0 1 0 4.4 12a1.8 1.8 0 1 0 .2 3.4A1.8 1.8 0 1 0 7 13.5M17 10.5a1.8 1.8 0 1 1 2.4-1.9 1.8 1.8 0 1 1 .2 3.4 1.8 1.8 0 1 1-.2 3.4 1.8 1.8 0 1 1-2.4-1.9"/><path d="M7 10.5h10v3H7z" ${ICON_FILL} fill-opacity=".2"/><path d="M11 10.5l1.3 1.5-1.1.8 1.4.7"/></g>`,
    sealed: `<path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/><rect x="5.5" y="10.5" width="13" height="10" rx="2"/><rect x="5.5" y="10.5" width="13" height="10" rx="2" ${ICON_FILL} fill-opacity=".18"/><circle cx="12" cy="14.8" r="1.3"/><path d="M12 16.1v2"/>`,
    cursed: `<path d="M3 11c2.6-4 5.6-5.5 9-5.5s6.4 1.5 9 5.5c-2.6 4-5.6 5.5-9 5.5S5.6 15 3 11z"/><circle cx="12" cy="11" r="3"/><circle cx="12" cy="11" r="3" ${ICON_FILL} fill-opacity=".35"/><circle cx="12" cy="11" r="1" ${ICON_FILL}/><path d="M7 3.5l3 1.4M17 3.5l-3 1.4"/><path d="M12 17.5c1 1.4 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-3z" ${ICON_FILL} fill-opacity=".6"/>`,
    slow: `<circle cx="13.5" cy="11.5" r="5.5"/><circle cx="13.5" cy="11.5" r="5.5" ${ICON_FILL} fill-opacity=".15"/><path d="M13.5 11.5a1.4 1.4 0 1 1 1.4 1.4 2.8 2.8 0 0 1-2.8-2.8 4.2 4.2 0 0 1 5.6 4"/><path d="M2.5 18.5h14c2 0 3.8-1.2 4.5-3.2M2.5 18.5c0-1.5 1-2.5 2.5-2.5h3M5 16v-4.2M7.3 16v-3.3"/><circle cx="5" cy="11.2" r=".7" ${ICON_FILL}/><circle cx="7.3" cy="12.1" r=".7" ${ICON_FILL}/>`,
    tax: `<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="6.5" ${ICON_FILL} fill-opacity=".15"/><path d="M7.4 10h5.2"/><path d="M15.2 15.2l4.3 4.3M19.5 15.7v3.8h-3.8"/>`,

    // ── Meta upgrades ──
    extraMoves: `<path d="M3.5 3.5h9M3.5 20.5h9M4.7 3.5c0 3.8 1.2 5.2 3.3 8.5-2.1 3.3-3.3 4.7-3.3 8.5M11.3 3.5c0 3.8-1.2 5.2-3.3 8.5 2.1 3.3 3.3 4.7 3.3 8.5"/><path d="M6.2 6.5h3.6c-.4 1-1 1.9-1.8 2.8-.8-.9-1.4-1.8-1.8-2.8zM5.9 19.5c.4-1.4 1.1-2.1 2.1-2.5 1 .4 1.7 1.1 2.1 2.5z" ${ICON_FILL} fill-opacity=".35"/><path d="M18 9v6M15 12h6"/>`,
    startTile: `<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="4" y="4" width="16" height="16" rx="3" ${ICON_FILL} fill-opacity=".12"/><path d="M12 7.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2L7.5 12l3.2-1.3z"/><path d="M12 7.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2L7.5 12l3.2-1.3z" ${ICON_FILL} fill-opacity=".35"/>`,
    goldBonus: `<circle cx="10" cy="14.5" r="6"/><path d="M8.8 8.6V3.5M11.2 8.6V5.8M7.6 3.5h3.6M11.2 5.8 19 9v3.2"/><path d="M4.4 15.5a5.6 5.6 0 0 0 11.2 0z" ${ICON_FILL} fill-opacity=".3"/><circle cx="19" cy="15.8" r="2.4"/><path d="M19 14.7l.8 1.1-.8 1.1-.8-1.1z" ${ICON_FILL}/>`,
    relicSlots: `<path d="M6 9.5a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20z"/><path d="M9.5 5.5V4A1.5 1.5 0 0 1 11 2.5h2A1.5 1.5 0 0 1 14.5 4v1.5M6 11.5h12"/><path d="M8.5 14h7v4.5h-7z"/><path d="M8.5 14h7v4.5h-7z" ${ICON_FILL} fill-opacity=".25"/>`,
    startRelic: `<path d="M12 6.3l1.5 4.1 4.4.2-3.4 2.7 1.2 4.2L12 15.1l-3.7 2.4 1.2-4.2-3.4-2.7 4.4-.2z"/><path d="M12 6.3l1.5 4.1 4.4.2-3.4 2.7 1.2 4.2L12 15.1l-3.7 2.4 1.2-4.2-3.4-2.7 4.4-.2z" ${ICON_FILL} fill-opacity=".3"/><path d="M12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4M2.8 13.5h2M19.2 13.5h2M12 20v2" opacity=".6"/>`,
    forgedEntropy: `<path d="M5 9h14v2.3c-1.6.8-3.2 1.2-4.4 1.4l-.8 3.3H16v2H8v-2h2.2l-.8-3.3C7.8 12.5 6 12 5 11.3c-1.4 0-2.4-.4-3-1.1C2.9 9.4 3.9 9 5 9z"/><path d="M5 9h14v2.3c-1.6.8-3.2 1.2-4.4 1.4h-5.2C7.8 12.5 6 12 5 11.3z" ${ICON_FILL} fill-opacity=".25"/><path d="M6.5 20.5h11M14 6.3l1.5-2.5M17 6.8l2.5-1.5M11.5 5.8l-.5-2.5"/>`,
    synergy: `<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/><path d="M12 7.4a5.5 5.5 0 0 1 0 9.2 5.5 5.5 0 0 1 0-9.2z" ${ICON_FILL} fill-opacity=".4"/>`,
    deepForge: `<path d="M13 3.5l6.5 6.5-2.3 2.3-6.5-6.5z"/><path d="M13 3.5l6.5 6.5-2.3 2.3-6.5-6.5z" ${ICON_FILL} fill-opacity=".25"/><path d="M12.2 9.2 3.8 17.6a1.6 1.6 0 0 0 2.3 2.3l8.4-8.4"/><path d="M19.8 15.8l1.6.6M17.8 18.6l.8 1.6M15.2 20.2l.2 1.6" opacity=".7"/>`,
    destiny: `<path d="M17 3.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8L13 7.5l2.8-1.2z"/><path d="M17 3.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8L13 7.5l2.8-1.2z" ${ICON_FILL} fill-opacity=".35"/><path d="M13.6 11.2 4 20.8"/><path d="M10.8 8.6 5.4 14M16.2 13.8l-5.4 5.4" opacity=".5"/>`,
    singularity: `<ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(30 12 12)" opacity=".45"/><circle cx="12" cy="12" r="2.6" ${ICON_FILL}/><circle cx="19.6" cy="7.4" r="1.1" ${ICON_FILL} fill-opacity=".6"/>`,
    mastery: `<path d="M12 3 21.5 20h-19z"/><path d="M12 3 21.5 20h-19z" ${ICON_FILL} fill-opacity=".1"/><path d="M7.5 14.5c1.4-2 2.9-3 4.5-3s3.1 1 4.5 3c-1.4 2-2.9 3-4.5 3s-3.1-1-4.5-3z"/><circle cx="12" cy="14.5" r="1.3" ${ICON_FILL}/>`,

    // ── UI and events ──
    gold: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="6.3" opacity=".45"/><path d="M12 8.2 14.9 12 12 15.8 9.1 12z" ${ICON_FILL} fill-opacity=".45"/>`,
    gift: `<path d="M3.5 10h17v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 10V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2" /><path d="M3.5 10V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2z" ${ICON_FILL} fill-opacity=".22"/><path d="M8 4v17M16 4v17" opacity=".45"/><path d="M10.5 11.5h3v3.5h-3z"/><path d="M10.5 11.5h3v3.5h-3z" ${ICON_FILL} fill-opacity=".5"/>`,
    sparkle: `<path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z"/><path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z" ${ICON_FILL} fill-opacity=".25"/><path d="M19 15.5c.3 1.7 1.3 2.7 3 3-1.7.3-2.7 1.3-3 3-.3-1.7-1.3-2.7-3-3 1.7-.3 2.7-1.3 3-3z"/>`,
    trap: `<path d="M3 16.5h18M4.5 16.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5"/><path d="M6.5 16.5l1.2-3 1.3 3 1.5-3.6 1.5 3.6 1.5-3.6 1.5 3.6 1.3-3 1.2 3"/><path d="M4.5 16.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5z" ${ICON_FILL} fill-opacity=".12"/><path d="M12 16.5v2.5M10.2 21h3.6"/>`,
    slots: `<rect x="3" y="9.5" width="10" height="10" rx="2"/><rect x="3" y="9.5" width="10" height="10" rx="2" ${ICON_FILL} fill-opacity=".15"/><circle cx="5.8" cy="12.3" r=".9" ${ICON_FILL}/><circle cx="8" cy="14.5" r=".9" ${ICON_FILL}/><circle cx="10.2" cy="16.7" r=".9" ${ICON_FILL}/><g transform="rotate(15 16.5 8)"><rect x="12.5" y="4" width="8" height="8" rx="1.6"/><circle cx="14.8" cy="6.3" r=".8" ${ICON_FILL}/><circle cx="18.2" cy="9.7" r=".8" ${ICON_FILL}/></g>`,
    ambush: `<path d="M12 3.5 18.5 6v5.5c0 4-2.6 6.8-6.5 8.5-3.9-1.7-6.5-4.5-6.5-8.5V6z"/><path d="M12 3.5 18.5 6v5.5c0 4-2.6 6.8-6.5 8.5-3.9-1.7-6.5-4.5-6.5-8.5V6z" ${ICON_FILL} fill-opacity=".15"/><path d="M21 3 9.5 14.5M8 13l3 3M9.5 14.5 5.5 18.5"/><path d="M21 3l-.8 3-2.2-2.2z" ${ICON_FILL}/>`,
    castle: `<path d="M3 21h18M5 21V10h14v11M5 10V6h2.5v2h2V6h5v2h2V6H19v4"/><path d="M5 10h14v11H5z" ${ICON_FILL} fill-opacity=".14"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/><path d="M11.4 12.5h1.2v1.8h-1.2z" ${ICON_FILL}/>`,
    flame: `<path d="M12 21.5c-4 0-6.3-2.4-6.3-5.7 0-3.3 2.3-4.8 3.2-8.1 1.3 1.4 1.9 2.8 1.8 4.2 1.6-1.4 3.1-4 2.7-9.4 3.4 2.3 7 6.4 7 11.8 0 4.1-2.8 7.2-8.4 7.2z"/><path d="M12 21.5c-1.7 0-2.8-1-2.8-2.5s1.2-2.4 2.3-4c1.1 1.4 2.9 2.4 2.9 4.1 0 1.4-.9 2.4-2.4 2.4z" ${ICON_FILL} fill-opacity=".45"/>`,
    death: `<path d="M12 3C7.6 3 5 6.1 5 10c0 2.4 1 4.1 2.5 5.1V18h9v-2.9C18 14.1 19 12.4 19 10c0-3.9-2.6-7-7-7z"/><path d="M7.9 9.5l2.6 2.6M10.5 9.5l-2.6 2.6M13.5 9.5l2.6 2.6M16.1 9.5l-2.6 2.6M12 13.4 11 15.2h2zM10 18v2.5M12 18v2.5M14 18v2.5M8.8 20.5h6.4"/><path d="M12 3v2.8l1.4 1.4" opacity=".6"/>`,
    ascend: `<path d="M6 12.5l6-6 6 6M6 18.5l6-6 6 6"/><path d="M6 18.5l6-6 6 6-6-3z" ${ICON_FILL} fill-opacity=".2"/><path d="M12 2v2.2"/>`,
    forge: `<path d="M5 12h14v2.3c-1.6.8-3.2 1.2-4.4 1.4l-.8 3.3H16v2H8v-2h2.2l-.8-3.3C7.8 15.5 6 15 5 14.3c-1.4 0-2.4-.4-3-1.1.9-.8 1.9-1.2 3-1.2z"/><path d="M5 12h14v2.3c-1.6.8-3.2 1.2-4.4 1.4H9.4C7.8 15.5 6 15 5 14.3z" ${ICON_FILL} fill-opacity=".25"/><path d="M14.5 2.5l3.5 3.5-1.6 1.6-3.5-3.5zM14.7 5.8l-3.9 3.9"/>`,
    abandon: `<path d="M5 21.5V3"/><path d="M5 4c3-1.4 5.2 1.4 8.2 0s4.8-1 6.3 0v8c-1.5-1-3.3-1.4-6.3 0S8 10.6 5 12"/><path d="M5 4c3-1.4 5.2 1.4 8.2 0s4.8-1 6.3 0v8c-1.5-1-3.3-1.4-6.3 0S8 10.6 5 12z" ${ICON_FILL} fill-opacity=".15"/>`,
    warning: `<path d="M12 3.5 21 19.5H3z"/><path d="M12 3.5 21 19.5H3z" ${ICON_FILL} fill-opacity=".12"/><path d="M12 9.5v5"/><circle cx="12" cy="17" r=".8" ${ICON_FILL}/>`,
    obstacle: `<rect x="3" y="5" width="18" height="14" rx="1"/><rect x="3" y="5" width="18" height="14" rx="1" ${ICON_FILL} fill-opacity=".12"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19" opacity=".75"/>`,
    bomb: `<circle cx="11" cy="14" r="6.5"/><circle cx="11" cy="14" r="6.5" ${ICON_FILL} fill-opacity=".2"/><path d="M14.6 8.7l1.6-1.6 1.6 1.6-1.6 1.6M16.9 6.4c.8-1.7 2-2.6 3.5-2.9M7.8 12.5a3.5 3.5 0 0 1 2.4-2.4"/><path d="M21 1.8v1.4M22.3 3.7h-1.4M21.9 2.3l-.9.9" opacity=".75"/>`,
  },
  _warned: new Set(),
  svg(id, extraClass = '') {
    let shape = this.shapes[id];
    if (!shape) {
      if (!this._warned.has(id)) { console.warn(`Unknown icon id: ${id}`); this._warned.add(id); }
      shape = '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 5-5 5-5-5z"/>';
    }
    const cls = String(extraClass).replace(/[^\w\s-]/g, '').trim();
    return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
  },
};
