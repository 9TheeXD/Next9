--
-- PostgreSQL database dump
--

\restrict 3ekfprH7kNei1DrJ9UiYbYb6Zw8LjdnwBnpTmYhY9tOz6ucSKNddRxxFiWkY9Rb

-- Dumped from database version 16.14
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-0ubuntu0.25.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS '';


--
-- Name: BadgeCategory; Type: TYPE; Schema: public; Owner: nextbreath
--

CREATE TYPE public."BadgeCategory" AS ENUM (
    'STREAK',
    'HEALTH',
    'QUIZ',
    'MILESTONE'
);


ALTER TYPE public."BadgeCategory" OWNER TO nextbreath;

--
-- Name: SmokingType; Type: TYPE; Schema: public; Owner: nextbreath
--

CREATE TYPE public."SmokingType" AS ENUM (
    'CIGARETTE',
    'POD'
);


ALTER TYPE public."SmokingType" OWNER TO nextbreath;

--
-- Name: SoundCategory; Type: TYPE; Schema: public; Owner: nextbreath
--

CREATE TYPE public."SoundCategory" AS ENUM (
    'ENCOURAGEMENT',
    'UI'
);


ALTER TYPE public."SoundCategory" OWNER TO nextbreath;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: nextbreath
--

CREATE TYPE public."UserRole" AS ENUM (
    'SMOKER',
    'FAMILY',
    'ADMIN'
);


ALTER TYPE public."UserRole" OWNER TO nextbreath;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Badge; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."Badge" (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    "iconName" text NOT NULL,
    category public."BadgeCategory" NOT NULL,
    "criteriaDays" integer,
    "criteriaValue" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Badge" OWNER TO nextbreath;

--
-- Name: ChatMessage; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."ChatMessage" (
    id text NOT NULL,
    "userId" text NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    alias text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "isEdited" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."ChatMessage" OWNER TO nextbreath;

--
-- Name: Cheer; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."Cheer" (
    id text NOT NULL,
    "senderId" text NOT NULL,
    "receiverId" text NOT NULL,
    message text DEFAULT '💪 Keep going!'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Cheer" OWNER TO nextbreath;

--
-- Name: DailyLog; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."DailyLog" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "logDate" date DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cigarettesSmoked" integer DEFAULT 0 NOT NULL,
    "cravingCount" integer DEFAULT 0 NOT NULL,
    mood text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "articlesRead" integer DEFAULT 0 NOT NULL,
    "gamesPlayed" integer DEFAULT 0 NOT NULL,
    "soundsListened" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."DailyLog" OWNER TO nextbreath;

--
-- Name: FollowerSurveyResponse; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."FollowerSurveyResponse" (
    id text NOT NULL,
    "displayId" text NOT NULL,
    "userId" text,
    relation text NOT NULL,
    "smokingFrequency" text NOT NULL,
    concern text NOT NULL,
    "supportMethod" text NOT NULL,
    reward text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."FollowerSurveyResponse" OWNER TO nextbreath;

--
-- Name: QuizResult; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."QuizResult" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "quizId" text NOT NULL,
    score integer NOT NULL,
    "maxScore" integer NOT NULL,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."QuizResult" OWNER TO nextbreath;

--
-- Name: Sound; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."Sound" (
    id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    duration integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    category public."SoundCategory" DEFAULT 'UI'::public."SoundCategory" NOT NULL,
    "defaultUrl" text,
    description text,
    "isSystem" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Sound" OWNER TO nextbreath;

--
-- Name: SurveyResponse; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."SurveyResponse" (
    id text NOT NULL,
    "displayId" text NOT NULL,
    "ageGroup" text NOT NULL,
    gender text NOT NULL,
    occupation text NOT NULL,
    "smokingType" text NOT NULL,
    frequency text NOT NULL,
    "cravingTime" text NOT NULL,
    duration text NOT NULL,
    "addictionLevel" text NOT NULL,
    "wantedToQuit" text NOT NULL,
    "reasonToQuit" text NOT NULL,
    "previousMethods" text,
    "longestQuit" text,
    "interestedInApp" text NOT NULL,
    "desiredHelp" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text,
    "isDeleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."SurveyResponse" OWNER TO nextbreath;

--
-- Name: User; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "phoneNumber" text,
    "passwordHash" text,
    role public."UserRole" DEFAULT 'SMOKER'::public."UserRole" NOT NULL,
    "displayName" text NOT NULL,
    "cigarettesPerDay" integer,
    "pricePerPack" double precision,
    "cigarettesPerPack" integer DEFAULT 20 NOT NULL,
    "quitDate" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    "smokingType" public."SmokingType" DEFAULT 'CIGARETTE'::public."SmokingType" NOT NULL,
    "emergencyContact" text,
    "fcmToken" text,
    "displayId" text DEFAULT (floor(((random() * (9000)::double precision) + (1000)::double precision)))::text NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."User" OWNER TO nextbreath;

--
-- Name: UserActionLog; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."UserActionLog" (
    id text NOT NULL,
    "userId" text NOT NULL,
    action text NOT NULL,
    details text NOT NULL,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UserActionLog" OWNER TO nextbreath;

--
-- Name: UserBadge; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."UserBadge" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "badgeId" text NOT NULL,
    "earnedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UserBadge" OWNER TO nextbreath;

--
-- Name: _FollowersToSmokers; Type: TABLE; Schema: public; Owner: nextbreath
--

CREATE TABLE public."_FollowersToSmokers" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


ALTER TABLE public."_FollowersToSmokers" OWNER TO nextbreath;

--
-- Data for Name: Badge; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."Badge" (id, name, description, "iconName", category, "criteriaDays", "criteriaValue", "createdAt") FROM stdin;
\.


--
-- Data for Name: ChatMessage; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."ChatMessage" (id, "userId", content, "createdAt", alias, "isDeleted", "isEdited") FROM stdin;
\.


--
-- Data for Name: Cheer; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."Cheer" (id, "senderId", "receiverId", message, "createdAt") FROM stdin;
\.


--
-- Data for Name: DailyLog; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."DailyLog" (id, "userId", "logDate", "cigarettesSmoked", "cravingCount", mood, notes, "createdAt", "articlesRead", "gamesPlayed", "soundsListened") FROM stdin;
f6d34ba9-d26c-459b-a525-700053b154d0	1b915740-948c-46b2-9fc7-01315ce9d18b	2026-06-29	0	0	\N	\N	2026-06-29 16:24:36.789	0	5	2
\.


--
-- Data for Name: FollowerSurveyResponse; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."FollowerSurveyResponse" (id, "displayId", "userId", relation, "smokingFrequency", concern, "supportMethod", reward, "createdAt", "isDeleted") FROM stdin;
18cc11bb-a151-4583-83af-958ebe22fa90	8708	34da5bc0-e1e1-4870-9117-477dd6126f20	คนแปลกหน้า	สูบเฉพาะเวลาเครียดหรือเข้าสังคม	สุขภาพของคนรอบข้าง (ควันบุหรี่มือสอง)	ชวนทำกิจกรรมอื่นเบี่ยงเบนความสนใจ	เลี้ยงข้าว	2026-06-29 15:06:33.194	f
4b02d1cc-6053-4494-a5a7-d66ddd2f2898	6619	17a9471a-9ed6-4c3c-b113-c01639b8ea13	พี่น้อง	สูบเป็นบางวัน	สุขภาพของผู้สูบ	ให้รางวัลเมื่อทำเป้าหมายสำเร็จ	พาไปตรวจสุขภาพทุกปี	2026-06-29 15:33:30.239	f
\.


--
-- Data for Name: QuizResult; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."QuizResult" (id, "userId", "quizId", score, "maxScore", "completedAt") FROM stdin;
\.


--
-- Data for Name: Sound; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."Sound" (id, name, url, duration, "createdAt", "updatedAt", category, "defaultUrl", description, "isSystem") FROM stdin;
861fce23-3c59-491b-865f-ba4c060591ea	เริ่มใหม่ได้เสมอ!	https://ciga-next9.yumistack.net/api/sounds/1780730407748-sp0ks.wav	3	2026-06-06 07:20:07.75	2026-06-06 07:20:07.75	ENCOURAGEMENT	\N	พรุ่งนี้ก็วันใหม่ล่ะ เริ่มต้นใหม่ได้เสมอ	f
65a0bfa4-45f5-4624-b56b-d14de7cb08b0	เก่งมากก	https://ciga-next9.yumistack.net/api/sounds/1780730511693-19sdkb.wav	3	2026-06-06 07:21:51.694	2026-06-06 07:21:51.694	ENCOURAGEMENT	\N	เก่งมากแล้ว วันนี้ทำดีที่สุดแล้วนะ	f
e1c7d532-feeb-49c9-b60e-e89799ee9ab4	พยายามเข้านะ	https://ciga-next9.yumistack.net/api/sounds/1780730616684-t2lr9.wav	3	2026-06-06 07:23:36.687	2026-06-06 07:23:36.687	ENCOURAGEMENT	\N	ทุกความพยายามไม่เคยสูญเปล่าแน่นอน	f
47189a46-0b17-4675-a62d-bde4f61ec736	เหนื่อยก็พัก	https://ciga-next9.yumistack.net/api/sounds/1780730830812-t2rrk8.wav	3	2026-06-06 07:27:10.814	2026-06-06 07:27:10.814	ENCOURAGEMENT	\N	เหนื่อยก็พัก แต่อย่าพึ่งล้มเลิกนะ	f
ef12983f-c7dd-47ba-9761-c56d36c39677	Click	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/click.wav	1	2026-05-23 16:39:52.938	2026-05-23 17:36:41.653	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/click.wav	\N	t
b4c1e0e5-2cf9-4bd2-ad0d-04523e0c856a	Navigation	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/nav.wav	1	2026-05-23 16:39:52.944	2026-05-23 17:36:41.659	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/nav.wav	\N	t
40906ef7-7854-424d-93f8-63362cfabbd0	Correct	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/correct.wav	1	2026-05-23 16:39:52.947	2026-05-23 17:36:41.663	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/correct.wav	\N	t
a87ad295-50e5-4fc6-b4cd-7b31e74ee708	Wrong	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/wrong.wav	1	2026-05-23 16:39:52.95	2026-05-23 17:36:41.666	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/wrong.wav	\N	t
29a7ca66-db8d-4939-bcd9-12bd0412223d	Win	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/win.wav	3	2026-05-23 16:39:52.953	2026-05-23 17:36:41.669	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/win.wav	\N	t
db1e53f2-e71b-4bb7-a81b-96cd7a4caa43	Lose	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/lose.wav	3	2026-05-23 16:39:52.955	2026-05-23 17:36:41.673	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/lose.wav	\N	t
321697a8-efc4-4bff-9244-b8883da1b163	Badge Earned	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/badge.wav	4	2026-05-23 16:39:52.958	2026-05-23 17:36:41.675	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/badge.wav	\N	t
b13f5c06-a95b-4d8d-907d-f96e0e253a13	XP Gain	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/xp.wav	2	2026-05-23 16:39:52.96	2026-05-23 17:36:41.678	UI	https://breatheeasy-sounds.s3.ap-southeast-1.amazonaws.com/xp.wav	\N	t
038c6e09-d7d6-41f9-8cd1-229bc8eff7a8	ผ่านช่วงเวลา	https://ciga-next9.yumistack.net/api/sounds/1782279006650-xrv9na.wav	6	2026-06-24 05:30:06.652	2026-06-24 05:30:06.652	ENCOURAGEMENT	\N	เรามาจับมือผ่านช่วงเวลานี้ไปด้วยกัน มีอะไรให้ช่วยบอกได้เลย	f
14e08f09-b390-490c-8407-7ce261c9c25a	เก่งมากเลยนะ	https://ciga-next9.yumistack.net/api/sounds/1782279115241-vxp97.wav	3	2026-06-24 05:31:55.243	2026-06-24 05:31:55.243	ENCOURAGEMENT	\N	เก่งมากเลยนะที่ตั้งใจทำเพื่อตัวเองและครอบครัว	f
0db7bb22-e1c1-40a4-b662-d25aff1fe2e1	ไม่มีบุหรี่	https://ciga-next9.yumistack.net/api/sounds/1782279190734-tthkl.wav	7	2026-06-24 05:33:10.735	2026-06-24 05:33:10.735	ENCOURAGEMENT	\N	ทุกวันที่ผ่านไปโดยไม่มีบุหรี่ คุณกำลังชนะใจตัวเอง เชื่อว่าคุณทำได้แน่นอน!	f
6bb69154-3f02-4be1-b1f6-711c0b0152e9	ไม่ใช่การเสียสละ	https://ciga-next9.yumistack.net/api/sounds/1782279396628-q0r91j.wav	5	2026-06-24 05:36:36.633	2026-06-24 05:36:36.633	ENCOURAGEMENT	\N	การเลิกบุหรี่ไม่ใช่การเสียสละ แต่เป็นการเริ่มต้นชีวิตใหม่ที่ดีกว่าเดิม	f
a1731f3e-c64c-4cd6-8514-35b9f073c73c	ลดจำนวน	https://ciga-next9.yumistack.net/api/sounds/1782279655118-55ex6r.wav	5	2026-06-24 05:40:55.12	2026-06-24 05:40:55.12	ENCOURAGEMENT	\N	แค่วันนี้คุณลดจำนวนลงได้เราก็ภูมิใจในตัวคุณมากแล้ว	f
9040a4ab-d97d-4343-9917-deeb431a506f	เก่งมาก	https://ciga-next9.yumistack.net/api/sounds/1782279804499-p85myd.wav	4	2026-06-24 05:43:24.501	2026-06-24 05:43:24.501	ENCOURAGEMENT	\N	คุณเก่งมากแล้วที่กล้าตัดสินใจเลิก	f
e8720006-f1d6-48ab-a40f-24e167f39d5f	ร่างกายฟื้นฟู	https://ciga-next9.yumistack.net/api/sounds/1782279888271-nfpwmj.wav	5	2026-06-24 05:44:48.281	2026-06-24 05:44:48.281	ENCOURAGEMENT	\N	ทิ้งบุหรี่วันนี้ ร่างกายเริ่มฟื้นฟูตัวเองได้ทันทีเลยนะ	f
6b4a7b6b-7af4-4b1a-bdcc-aea1daada613	เพื่อคนที่รักคุณ	https://ciga-next9.yumistack.net/api/sounds/1782280249942-hk7wyf.wav	5	2026-06-24 05:50:49.944	2026-06-24 05:50:49.944	ENCOURAGEMENT	\N	เลิกสูบเพื่อตัวเองนะ แล้วก็เพื่อคนที่รักคุณด้วย	f
96600a5a-07a3-49b6-8b5e-58afd7e8ec0c	เธอแข็งแกร่ง	https://ciga-next9.yumistack.net/api/sounds/1782231564107-ejrjuv.wav	5	2026-06-23 16:19:24.109	2026-06-24 06:08:51.614	ENCOURAGEMENT	\N	เธอแข็งแกร่งกว่าความอยากสูบในหัวใจตัวเองตั้งเยอะ เชื่อมั่นในตัวเองหน่อย	f
371b31b7-45b1-493c-8a79-462ebe4eb3ae	ชีวิตใหม่	https://ciga-next9.yumistack.net/api/sounds/1782231657010-ns5xtf.wav	4	2026-06-23 16:20:57.013	2026-06-24 06:09:18.438	ENCOURAGEMENT	\N	เลือกปอดใหม่ เลือกชีวิตใหม่ เริ่มต้นที่วันนี้	f
6a68952d-250d-4679-9bee-bf89beebe20c	อยากอยู่กับเธอนานๆ	https://ciga-next9.yumistack.net/api/sounds/1782231701593-pqtzt9.wav	6	2026-06-23 16:21:41.596	2026-06-24 06:10:00.933	ENCOURAGEMENT	\N	ที่เราอยากให้เธอเลิก ไม่ใช่เพราะรำคาญกลิ่นหรอกนะ... แต่เพราะเราอยากเคียงข้างและอยู่กับเธอนานๆ ต่างหาก	f
a0bbe1f7-7f62-42af-ad87-b25aed2e0249	ปอดแข็งแรง	https://ciga-next9.yumistack.net/api/sounds/1782280411684-8wlla4.wav	6	2026-06-24 05:53:31.686	2026-06-24 05:53:31.686	ENCOURAGEMENT	\N	เลิกบุหรี่ตอนนี้ ปอดของคุณจะได้พักผ่อนและกลับมาแข็งแรงขึ้นแน่นอน	f
78fbccf0-d0d6-4e5b-a732-37bc4185ea03	สิ่งที่ดีที่สุด	https://ciga-next9.yumistack.net/api/sounds/1782231514623-3uv8x.wav	6	2026-06-23 16:18:34.627	2026-06-24 06:08:20.722	ENCOURAGEMENT	\N	ทุกวินาทีที่เธอเลือกปฏิเสธบุหรี่ คือวินาทีที่เธอกำลังเลือกสิ่งที่ดีที่สุดให้ชีวิตตัวเอง	f
\.


--
-- Data for Name: SurveyResponse; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."SurveyResponse" (id, "displayId", "ageGroup", gender, occupation, "smokingType", frequency, "cravingTime", duration, "addictionLevel", "wantedToQuit", "reasonToQuit", "previousMethods", "longestQuit", "interestedInApp", "desiredHelp", "createdAt", "userId", "isDeleted") FROM stdin;
70ea1680-3009-489b-9a9b-1aedfc72ec2b	9487	31-45 ปี	ผู้ชาย	นักเรียน	บุหรี่ธรรมดา	3-4	06:00-10:00	3-6เดือน		ไม่เคย				สนใจ		2026-06-29 16:18:27.476	47463b1f-dd44-4194-ad81-31317cc9b0db	f
b1ed3ec1-0cc8-45d7-9941-54ab5e998e46	4326	13 - 18 ปี	ผู้ชาย	นักเรียน	บุหรี่ไฟฟ้า	1-2	20:00-23:00	3-6เดือน	ค่อนข้างมาก	ไม่เคย				สนใจ	เลิกบุหรี่	2026-06-29 16:19:24.149	1b915740-948c-46b2-9fc7-01315ce9d18b	f
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."User" (id, "phoneNumber", "passwordHash", role, "displayName", "cigarettesPerDay", "pricePerPack", "cigarettesPerPack", "quitDate", "createdAt", "updatedAt", xp, "smokingType", "emergencyContact", "fcmToken", "displayId", "isDeleted") FROM stdin;
b7d4e279-d712-4998-8774-ae95cf9e327b	admin	$2b$12$r/Xai0hm789EeGbHCLxL7e0RaA6blmZEG2LwnHh64h8aOfA5tghi2	ADMIN	Student Council Admin	\N	\N	20	\N	2026-06-25 23:21:33.162	2026-06-25 23:21:56.568	0	CIGARETTE	\N	\N	2995	f
34da5bc0-e1e1-4870-9117-477dd6126f20	\N	\N	FAMILY	ผู้ใช้งาน 8708	\N	100	20	\N	2026-06-29 15:06:33.503	2026-06-29 15:06:36.068	10	CIGARETTE	\N	cqi9YLyrb8UFC6zaNUkTtu:APA91bGl-fh36CkLKPvhimo-5GXJRKO_qN9SQ8wj3vhKgKkSalEsXXHu1e3oaKa3CWbmGXiCfgKlYa7_89IZWU4Qqb6LaLQ3VRWXV67tE9VsDoWXJ-TorEc	8708	f
17a9471a-9ed6-4c3c-b113-c01639b8ea13	\N	\N	FAMILY	ผู้ใช้งาน 6619	\N	100	20	\N	2026-06-29 15:33:30.58	2026-06-29 15:36:44.904	0	CIGARETTE	\N	fY8NYZIuK-j_ZkhhXNryzM:APA91bGXl5XQpKo7jqBiV2RhEmmT0rXD-2YQhCEOYgzdQPzyCDDzPbjuEK_jwp182UTnoHaZ0sjyCwG5Qu9wy4-G8UZTT4boKpmKXk8gHnja1Mv9aVmbJ0Q	6619	f
47463b1f-dd44-4194-ad81-31317cc9b0db	\N	\N	SMOKER	ผู้ใช้งาน 9487	4	100	20	\N	2026-06-29 16:18:27.815	2026-06-29 16:18:28.671	0	CIGARETTE	\N	c0867cvc6wQIbs7b27raHE:APA91bGIoDtffgNv44dsmIcfqVxyoSVQhUyqAYzheMgRWVQxeEOaXzbSvrUVasOrqzXyR51XMWUbCgrT_vdRUSS-KBabyxtPnQRAh6Zcd9QhlKnQn63oov8	9487	f
1b915740-948c-46b2-9fc7-01315ce9d18b	\N	\N	SMOKER	ผู้ใช้งาน 4326	2	100	20	\N	2026-06-29 16:19:24.465	2026-06-29 16:28:46.287	183	POD	\N	etDqs5kozvQe4iSv5wY32b:APA91bFJJc-fSukk5fSP0Wf-LzYTlWc9JxzGqzM-M_grT2XIDKEGtvJ8PXpnguq8wD5NYE0GZRJgQj47xQ4UAn2CTcf4yRT3YdjsPRQWzC6glrUgKXBASrc	4326	f
\.


--
-- Data for Name: UserActionLog; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."UserActionLog" (id, "userId", action, details, metadata, "createdAt") FROM stdin;
9925bb84-204a-4da2-8e37-4df6f6dc618c	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 5 XP จาก: รับฟังข้อความให้กำลังใจ	\N	2026-06-29 16:24:36.8
d72d0c67-1d28-41f2-baed-5364b167b932	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 5 XP จาก: รับฟังข้อความให้กำลังใจ	\N	2026-06-29 16:25:01.494
73872653-d833-4c05-928d-77cfa844bf94	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 72 XP จาก: ทำคะแนนแยกสีได้ 125 คะแนน!	\N	2026-06-29 16:26:59.878
701c637c-54ed-444f-b5ee-5b9af44a77f0	1b915740-948c-46b2-9fc7-01315ce9d18b	GAME_PLAYED	เล่นเกมเพื่อเบี่ยงเบนความสนใจ	\N	2026-06-29 16:27:04.951
621fffa1-a7ff-4b26-a187-0468f00a98f1	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 20 XP จาก: จับคู่สำเร็จใน 18 ครั้ง!	\N	2026-06-29 16:27:35.127
a6ffb6f2-ed04-4d5c-bf19-fe8081546103	1b915740-948c-46b2-9fc7-01315ce9d18b	GAME_PLAYED	เล่นเกมเพื่อเบี่ยงเบนความสนใจ	\N	2026-06-29 16:27:45.34
2ec9db2e-97b5-4425-aebd-6aa9ab98b9ca	1b915740-948c-46b2-9fc7-01315ce9d18b	GAME_PLAYED	เล่นเกมเพื่อเบี่ยงเบนความสนใจ	\N	2026-06-29 16:28:05.925
cf76a91d-55f9-4abb-b6e8-1e787ceb6dbb	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 2 XP จาก: ใจเย็นๆ ลองใหม่นะ	\N	2026-06-29 16:28:07.687
34c499c5-d45f-4aa4-ae54-34bccf6dc2d6	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 2 XP จาก: ใจเย็นๆ ลองใหม่นะ	\N	2026-06-29 16:28:08.587
efc1bb01-5c84-49a2-a48c-ea5c337950b6	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 2 XP จาก: ใจเย็นๆ ลองใหม่นะ	\N	2026-06-29 16:28:14.328
fa2d1ae9-b5d9-4e05-9fc4-94fb0301f654	1b915740-948c-46b2-9fc7-01315ce9d18b	GAME_PLAYED	เล่นเกมเพื่อเบี่ยงเบนความสนใจ	\N	2026-06-29 16:28:21.418
40f5a907-443c-45f2-9b1e-7ed9cf42d9b3	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 10 XP จาก: ไดโนเสาว์วิ่ง: ทำได้ 104 คะแนน	\N	2026-06-29 16:28:22.272
5c0605ae-6e33-437f-a71f-fb968debcef4	1b915740-948c-46b2-9fc7-01315ce9d18b	XP_GAIN	ได้รับ 50 XP จาก: ไดโนเสาว์วิ่ง: ทำได้ 1499 คะแนน	\N	2026-06-29 16:28:46.269
\.


--
-- Data for Name: UserBadge; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."UserBadge" (id, "userId", "badgeId", "earnedAt") FROM stdin;
\.


--
-- Data for Name: _FollowersToSmokers; Type: TABLE DATA; Schema: public; Owner: nextbreath
--

COPY public."_FollowersToSmokers" ("A", "B") FROM stdin;
\.


--
-- Name: Badge Badge_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_pkey" PRIMARY KEY (id);


--
-- Name: ChatMessage ChatMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_pkey" PRIMARY KEY (id);


--
-- Name: Cheer Cheer_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."Cheer"
    ADD CONSTRAINT "Cheer_pkey" PRIMARY KEY (id);


--
-- Name: DailyLog DailyLog_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."DailyLog"
    ADD CONSTRAINT "DailyLog_pkey" PRIMARY KEY (id);


--
-- Name: FollowerSurveyResponse FollowerSurveyResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."FollowerSurveyResponse"
    ADD CONSTRAINT "FollowerSurveyResponse_pkey" PRIMARY KEY (id);


--
-- Name: QuizResult QuizResult_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."QuizResult"
    ADD CONSTRAINT "QuizResult_pkey" PRIMARY KEY (id);


--
-- Name: Sound Sound_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."Sound"
    ADD CONSTRAINT "Sound_pkey" PRIMARY KEY (id);


--
-- Name: SurveyResponse SurveyResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."SurveyResponse"
    ADD CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY (id);


--
-- Name: UserActionLog UserActionLog_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."UserActionLog"
    ADD CONSTRAINT "UserActionLog_pkey" PRIMARY KEY (id);


--
-- Name: UserBadge UserBadge_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _FollowersToSmokers _FollowersToSmokers_AB_pkey; Type: CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."_FollowersToSmokers"
    ADD CONSTRAINT "_FollowersToSmokers_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: Badge_name_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "Badge_name_key" ON public."Badge" USING btree (name);


--
-- Name: DailyLog_userId_logDate_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "DailyLog_userId_logDate_key" ON public."DailyLog" USING btree ("userId", "logDate");


--
-- Name: FollowerSurveyResponse_displayId_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "FollowerSurveyResponse_displayId_key" ON public."FollowerSurveyResponse" USING btree ("displayId");


--
-- Name: FollowerSurveyResponse_userId_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "FollowerSurveyResponse_userId_key" ON public."FollowerSurveyResponse" USING btree ("userId");


--
-- Name: SurveyResponse_displayId_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "SurveyResponse_displayId_key" ON public."SurveyResponse" USING btree ("displayId");


--
-- Name: SurveyResponse_userId_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "SurveyResponse_userId_key" ON public."SurveyResponse" USING btree ("userId");


--
-- Name: UserBadge_userId_badgeId_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON public."UserBadge" USING btree ("userId", "badgeId");


--
-- Name: User_displayId_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "User_displayId_key" ON public."User" USING btree ("displayId");


--
-- Name: User_phoneNumber_key; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE UNIQUE INDEX "User_phoneNumber_key" ON public."User" USING btree ("phoneNumber");


--
-- Name: _FollowersToSmokers_B_index; Type: INDEX; Schema: public; Owner: nextbreath
--

CREATE INDEX "_FollowersToSmokers_B_index" ON public."_FollowersToSmokers" USING btree ("B");


--
-- Name: ChatMessage ChatMessage_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Cheer Cheer_receiverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."Cheer"
    ADD CONSTRAINT "Cheer_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Cheer Cheer_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."Cheer"
    ADD CONSTRAINT "Cheer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DailyLog DailyLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."DailyLog"
    ADD CONSTRAINT "DailyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FollowerSurveyResponse FollowerSurveyResponse_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."FollowerSurveyResponse"
    ADD CONSTRAINT "FollowerSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QuizResult QuizResult_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."QuizResult"
    ADD CONSTRAINT "QuizResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SurveyResponse SurveyResponse_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."SurveyResponse"
    ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserActionLog UserActionLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."UserActionLog"
    ADD CONSTRAINT "UserActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserBadge UserBadge_badgeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES public."Badge"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserBadge UserBadge_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _FollowersToSmokers _FollowersToSmokers_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."_FollowersToSmokers"
    ADD CONSTRAINT "_FollowersToSmokers_A_fkey" FOREIGN KEY ("A") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _FollowersToSmokers _FollowersToSmokers_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextbreath
--

ALTER TABLE ONLY public."_FollowersToSmokers"
    ADD CONSTRAINT "_FollowersToSmokers_B_fkey" FOREIGN KEY ("B") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict 3ekfprH7kNei1DrJ9UiYbYb6Zw8LjdnwBnpTmYhY9tOz6ucSKNddRxxFiWkY9Rb

