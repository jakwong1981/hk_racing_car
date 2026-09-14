# Game Design Document (GDD): Neon Drift Hong Kong 
# 遊戲設計文件：霓虹飄移香港

**Role:** Vibe Coding Master GDD for AI-assisted development environments (e.g., Cursor, Qoder).
**Objective:** Build Phase 1 of a web-based, Hong Kong-themed 3D kart racing game with Mario Kart-style physics.

---

## 1. Game Overview / 遊戲概述
A high-speed, arcade-style 3D kart racing game set in the chaotic, neon-lit streets of Hong Kong. The game emphasizes asymmetrical vehicle classes, Mario Kart-style drifting physics, and deeply localized environmental hazards.
結合香港獨特街頭文化、不對稱車輛職業、瑪利歐賽車風格飄移物理機制及高度在地化環境陷阱的高速 3D 卡丁車賽車遊戲。

---

## 2. Vehicle Roster & Classes / 車種陣容與職業
Players choose from four iconic Hong Kong vehicles, each representing a distinct fighting-game-style archetype:
玩家可選擇四種極具香港特色的車輛，對應不同的操作邏輯與職業特性：

| Vehicle (車種) | Weight Class (量級) | Core Characteristic (核心特色) |
| :--- | :--- | :--- |
| **的士 (Red Taxi)** | Light (輕量) | **Speed Demon (極速狂飆):** Max top speed but terrible baseline grip. Relies entirely on high-skill manual drifting to survive corners. (高極速，低抓地力，極度依賴手動飄移過彎) |
| **小巴 (Red Minibus)** | Med-Heavy (中重) | **The Brawler (戰術推土機):** Wide hitbox and low top speed. Steals momentum (speed boosts) by aggressively ramming lighter vehicles. (車身寬大，撞擊輕型車輛可吸取動能轉化為加速) |
| **雙層巴士 (Double-Decker)** | Super-Heavy (超重) | **Juggernaut (動能霸主):** Slow acceleration but unstoppable at top speed. High roll-over risk if turning without braking. (起步慢但極速狀態下無法被逼停，重心過高易翻車) |
| **電車 (The Tram)** | Max (絕對重量) | **Tracked Wall (軌道路障):** Cannot steer freely; snaps between pre-set track rails. Grants absolute defense. (只能在預設電車軌道上切換，擁有絕對防禦) |

---

## 3. Track Design, Items & Hazards / 賽道、道具與陷阱

**1. Mong Kok Ladies' Market (旺角女人街)**
*   **Item:** *P2P Marketplace Bomb (二手拍賣炸彈)* - Floods opponent's screen with localized haggling pop-ups ("Trade in Sham Shui Po?"), causing blindness and a speed debuff.
*   **Hazard:** *Lost Property Cordon (失物報案封鎖線)* - Police cordons that detain the player for 3 seconds to "file a report" upon collision.

**2. Wan Chai Heritage District (灣仔復古街區)**
*   **Item:** *Pomade Slick (復古髮油)* - A slippery trap that causes karts to lose grip, but grants the victim a highly-reflective buff that repels light karts.
*   **Hazard:** *Hypnotic Barber Pole (催眠理髮燈柱)* - Giant spinning neon poles that temporarily reverse the player's steering controls when driving through their light.

**3. Kwai Chung Container Terminal (葵涌貨櫃碼頭)**
*   **Item:** *Fluorescent Water Decal (螢光水貼)* - Grants a 5-second "Seamless" buff, making the kart frictionless and immune to collision physics.
*   **Hazard:** *Falling Plastic Sprues (巨型模型框架)* - Cranes drop massive unclipped Gunpla plastic model sprues (arms, backpacks), creating dynamic roadblocks.

**4. Lantau Peak & Tian Tan Buddha (大嶼山天壇大佛)**
*   **Item:** *Incense Stick (祈福大香)* - Ignites a giant incense stick on the kart, granting a 3-second super-armor buff and blinding trailing racers with smoke.
*   **Hazard:** *Wandering Lantau Cows (大嶼山流浪牛)* - Unstoppable, massive cows wandering the track. Hitting them causes an instant flip.

---

## 4. Core Systems / 核心系統

### Difficulty Selection (難度選擇)
*   **學牌 (Learner - 50cc):** Max steering assist, low collision penalties.
*   **P 牌 (Probationary - 100cc):** Standard physics, longer trap durations.
*   **職業司機 (Professional - 150cc):** Unlocked physics limits, aggressive AI, extreme momentum loss on impact.

### Dragon & Tiger Leaderboard (龍虎榜系統)
*   **Arcade Rankings:** Ranks players based on time, drift counters, and successful rams.
*   **Ghost Data:** Download asynchronous ghost data from top players to study driving lines.

### Control Scheme (Phase 1 Web) / 操作控制 (網頁版)
*   **Steering/Pitch (轉向/重心):** `WASD` or `Arrow Keys`
*   **Accelerate (加速):** `A`
*   **Brake/Reverse (煞車/倒車):** `B`
*   **Item/Drift (道具/飄移):** `Spacebar`

---

## 5. Technical Stack & Deployment / 技術棧與部署

*   **Frontend/UI:** Vue 3 (Composition API) + Vite.
*   **3D Engine:** Three.js (WebGL, .glb Draco compression).
*   **Physics:** Rapier.js (`@dimforge/rapier3d-compat`, WASM).
*   **Backend:** Python (FastAPI) + Redis (ZSET) for leaderboards.
*   **Deployment:** Docker (Multi-stage build) + Nginx serving static SPA & WASM files.

---

## 6. Vibe Coding Implementation Prompts / AI 開發提示詞序列

Feed these steps sequentially to the AI code generator.
請依序將以下提示詞輸入給 AI 開發工具。

**Prompt 1: Project Skeleton & UI Layer (專案骨架與 UI 層)**
> "Initialize a Vue 3 + Vite project. Create a full-screen HTML canvas for Three.js. Overlay a Vue-based HUD with a speedometer (0-200 km/h) and a dynamic leaderboard UI. Create an `InputManager.ts` that maps keyboard events (Arrow Keys, A, B, Space) to a reactive Vue state."
> *(初始化 Vue 3 + Vite 專案。建立 Three.js 畫布與 Vue HUD 抬頭顯示器。建立 InputManager.ts 處理鍵盤映射。)*

**Prompt 2: Rendering Loop & Environment (渲染循環與環境)**
> "Integrate Three.js and `@dimforge/rapier3d-compat`. Set up the rendering loop (`requestAnimationFrame`) synchronized with the Rapier physics step. Create a flat ground plane and a basic neon-lit lighting setup."
> *(整合 Three.js 與 Rapier.js。設定渲染循環與物理步長同步。建立地面與霓虹燈光影環境。)*

**Prompt 3: Arcade Kart Controller Base (街機卡丁車控制器基底)**
> "Implement an 'Arcade Hover-Sphere' physics controller using Rapier.js. The kart's collider should be a sphere that uses a single raycast to hover at a fixed distance above the ground. Apply acceleration as a forward force relative to the camera direction, and steering by directly modifying the angular velocity. Ensure the kart never flips over."
> *(實作「街機懸浮球體」物理控制器。使用單一向下射線檢測維持懸浮。施加向前推力加速，並直接修改角速度轉向，確保車輛不翻轉。)*

**Prompt 4: Hop, Drift & Mini-Turbo Mechanics (跳躍、飄移與微型加速)**
> "Implement a Mario Kart-style drift mechanic. Bind a 'Drift' state to a key. When activated while turning, apply a small vertical hop. While in the Drift state, allow the kart to slide laterally, and increase the turning sharpness. Track drift duration to charge a 'Mini-Turbo', applying a massive forward impulse when released."
> *(實作瑪利歐賽車風格飄移。按下飄移鍵產生微小垂直跳躍。允許橫向側滑並提升轉向靈敏度。追蹤飄移時間進行微型加速充能，放開時給予向前衝刺力。)*

**Prompt 5: Track Hazards & Triggers (賽道陷阱與觸發器)**
> "Create a collision detection system. Add a sensor collider representing the 'Fluorescent Water Decal' on the track. When the vehicle enters this zone, apply a 'Seamless' buff that removes friction and collision penalties for 5 seconds."
> *(建立碰撞偵測系統。新增代表「螢光水貼」的感測碰撞體，觸發後給予 5 秒無視碰撞的無縫處理增益。)*