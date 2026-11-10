import { 
    Client, GatewayIntentBits, Partials, ActionRowBuilder, 
    StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, 
    InteractionType, REST, Routes, EmbedBuilder 
} from 'discord.js';
import axios from 'axios';
import FormData from 'form-data';
import 'dotenv/config';
import cron from 'node-cron';const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const PHOTOS_API_BASE = 'http://127.0.0.1:8089/api/photos';
const PHOTOS_PASSWORD = process.env.PHOTOS_PASSWORD || 'next9';
const CHANNEL_ID = process.env.CHANNEL_ID || '';

const pendingUploads = new Map();

const endpointsList = [
    { name: '🌐 Frontend', shortName: 'Frontend', url: 'https://next9.yumistack.net/' },
    { name: '📸 Photos API', shortName: 'Photos', url: 'https://next9.yumistack.net/api/photos/albums' },
    { name: '🏢 Building API', shortName: 'Building', url: 'https://next9.yumistack.net/api/building/config' },
    { name: '🚽 Toilet API', shortName: 'Toilet', url: 'https://next9.yumistack.net/toilet_config.json' },
    { name: '📄 Forms API', shortName: 'Forms', url: 'https://next9.yumistack.net/forms/inert/' }
];
let endpointStates = {};

async function performHealthCheck(triggerType = 'Scheduled') {
    const healthChannelId = '1515992711923236927';
    const channel = await client.channels.fetch(healthChannelId).catch(() => null);
    if (!channel) return;

    const endpoints = endpointsList;

    const results = [];
    let allGood = true;

    for (const ep of endpoints) {
        let isOk = false;
        let latency = 0;
        let attempts = 0;
        
        while (attempts < 3 && !isOk) {
            attempts++;
            const startTime = Date.now();
            try {
                const res = await axios.get(ep.url, { timeout: 15000 });
                isOk = res.status >= 200 && res.status < 400;
                latency = Date.now() - startTime;
            } catch (error) {
                latency = Date.now() - startTime;
                if (attempts < 3) await new Promise(r => setTimeout(r, 2000));
            }
        }
        
        if (!isOk) allGood = false;
        results.push({ ...ep, isOk, latency });
    }

    const mainText = allGood 
        ? `# 🩺 NEXT9 Health Check\n✅ **All systems operational.**\n*Trigger:* ${triggerType} | <t:${Math.floor(Date.now()/1000)}:f>` 
        : `# 🩺 NEXT9 Health Check\n⚠️ **Some systems are down!**\n*Trigger:* ${triggerType} | <t:${Math.floor(Date.now()/1000)}:f>`;

    // Build Components V2 Payload using Container (type 17)
    const componentsArray = [
        { type: 10, content: mainText } // TextDisplay for Header
    ];
    
    results.forEach((res) => {
        componentsArray.push({
            type: 17, // Container
            accent_color: res.isOk ? 0x2ECC71 : 0xE74C3C, // Green or Red accent bar
            components: [
                {
                    type: 10, // TextDisplay
                    content: `**${res.name}**\n${res.isOk ? '✅ Online' : '❌ Offline'} - \`${res.latency}ms\``
                }
            ]
        });
    });

    const payload = {
        flags: 32768, // MessageFlags.IsComponentsV2
        components: componentsArray
    };

    await channel.send(payload).catch(console.error);
}

async function performStateChangeCheck() {
    const healthChannelId = '1515992711923236927';
    const channel = await client.channels.fetch(healthChannelId).catch(() => null);
    if (!channel) return;

    const changes = [];
    const componentsArray = [];

    for (const ep of endpointsList) {
        let isOk = false;
        let latency = 0;
        let attempts = 0;
        
        while (attempts < 3 && !isOk) {
            attempts++;
            const startTime = Date.now();
            try {
                const res = await axios.get(ep.url, { timeout: 15000 });
                isOk = res.status >= 200 && res.status < 400;
                latency = Date.now() - startTime;
            } catch (error) {
                latency = Date.now() - startTime;
                if (attempts < 3) await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (endpointStates[ep.name] === undefined) {
            endpointStates[ep.name] = isOk;
            continue; 
        }

        if (endpointStates[ep.name] !== isOk) {
            const oldStateStr = endpointStates[ep.name] ? '✅ Online' : '❌ Offline';
            const newStateStr = isOk ? '✅ Online' : '❌ Offline';
            changes.push({
                name: ep.name,
                oldState: oldStateStr,
                newState: newStateStr,
                latency,
                isOk
            });
            endpointStates[ep.name] = isOk; 
        }
    }

    if (changes.length > 0) {
        let textMsg = `🚨 **System Status Changed!**\n`;
        changes.forEach(c => {
            textMsg += `- **${c.name}**: ${c.oldState} ➡️ ${c.newState} (\`${c.latency}ms\`)\n`;
        });
        
        componentsArray.push({
            type: 10,
            content: `# 🚨 System Status Changed!\n<t:${Math.floor(Date.now()/1000)}:R>`
        });
        
        changes.forEach((c) => {
            componentsArray.push({
                type: 17,
                accent_color: c.isOk ? 0x2ECC71 : 0xE74C3C,
                components: [
                    {
                        type: 10,
                        content: `**${c.name}**\nStatus changed: ${c.oldState} ➡️ ${c.newState} - \`${c.latency}ms\``
                    }
                ]
            });
        });

        const v2Payload = {
            flags: 32768, 
            components: componentsArray
        };

        await channel.send({ content: textMsg }).catch(console.error);
        await channel.send(v2Payload).catch(console.error);
    }
}

client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    const commands = [
        { name: 'albums', description: 'ดูรายชื่ออัลบั้มทั้งหมดที่มีบนเว็บ' },
        { name: 'create_album', description: 'สร้างอัลบั้มใหม่' },
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        if (process.env.GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        }
    } catch (error) {
        console.error('Failed to load slash commands:', error.message);
    }

    // Health check on startup (wait 5s)
    setTimeout(() => {
        performHealthCheck('Bot Started');
        // Initial state grab is done silently by performStateChangeCheck, but we can just let it run
        performStateChangeCheck(); 
    }, 5000);

    // Health check every day at 06:00 AM (Thai Time)
    cron.schedule('0 6 * * *', () => {
        performHealthCheck('Daily Check 06:00');
    }, {
        timezone: "Asia/Bangkok"
    });

    // Background checker every 1 minute
    cron.schedule('* * * * *', () => {
        performStateChangeCheck();
    });
});

async function getUploadMenuPayload(pendingData) {
    const response = await axios.get(`${PHOTOS_API_BASE}/albums`);
    let albums = response.data;

    if (pendingData.searchQuery) {
        const q = pendingData.searchQuery.toLowerCase();
        albums = albums.filter(a => a.name.toLowerCase().includes(q));
    }

    const pageSize = 25;
    const totalPages = Math.ceil(albums.length / pageSize);
    
    if (pendingData.currentPage < 0) pendingData.currentPage = 0;
    if (totalPages > 0 && pendingData.currentPage >= totalPages) pendingData.currentPage = totalPages - 1;

    const start = pendingData.currentPage * pageSize;
    const currentAlbums = albums.slice(start, start + pageSize);

    const options = currentAlbums.map(a => ({
        label: a.name.substring(0, 100),
        description: `มีรูปภาพ ${a.photo_count} รูป${a.is_locked ? ' 🔒' : ''}`,
        value: `${a.id}|${a.is_locked ? '1' : '0'}`
    }));

    const components = [];
    
    if (options.length > 0) {
        const row1 = new ActionRowBuilder();
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_album')
            .setPlaceholder(pendingData.searchQuery ? `ผลการค้นหา "${pendingData.searchQuery}" (หน้า ${pendingData.currentPage + 1}/${totalPages})` : `เลือกอัลบั้มที่จะอัปโหลด (หน้า ${pendingData.currentPage + 1}/${totalPages})`)
            .addOptions(options);
        row1.addComponents(select);
        components.push(row1);
    }

    if (totalPages > 1) {
        const pageRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('upload_page_prev')
                .setLabel('◀️ ก่อนหน้า')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pendingData.currentPage === 0),
            new ButtonBuilder()
                .setCustomId('upload_page_next')
                .setLabel('ถัดไป ▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pendingData.currentPage === totalPages - 1)
        );
        components.push(pageRow);
    }

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('search_album_btn')
            .setLabel('🔍 ค้นหา')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('create_album_btn')
            .setLabel('➕ สร้างอัลบั้ม')
            .setStyle(ButtonStyle.Success)
    );
    
    if (pendingData.searchQuery) {
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId('clear_search_btn')
                .setLabel('✖️ ล้างค้นหา')
                .setStyle(ButtonStyle.Danger)
        );
    }
    components.push(actionRow);

    const content = options.length > 0 
        ? `📸 พบรูปภาพ ${pendingData.images.length} รูป กรุณาเลือกอัลบั้มที่ต้องการอัปโหลด:` 
        : `📸 พบรูปภาพ ${pendingData.images.length} รูป แต่ไม่พบอัลบั้ม${pendingData.searchQuery ? 'ที่ค้นหา' : 'เลย'}`;

    return { content, components };
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (CHANNEL_ID && message.channel.id !== CHANNEL_ID) return;

    const images = message.attachments.filter(att => att.contentType && att.contentType.startsWith('image/'));
    
    if (images.size > 0) {
        try { await message.react('⏳'); } catch (e) {}

        const pendingData = {
            images: Array.from(images.values()),
            originalMessage: message,
            currentPage: 0,
            searchQuery: ''
        };
        pendingUploads.set(message.author.id, pendingData);

        try {
            const payload = await getUploadMenuPayload(pendingData);
            pendingData.replyMessage = await message.reply(payload);

            setTimeout(() => {
                pendingUploads.delete(message.author.id);
            }, 10 * 60 * 1000);

        } catch (error) {
            message.channel.send('❌ เกิดข้อผิดพลาดในการดึงข้อมูลอัลบั้ม');
            try { await message.reactions.removeAll(); await message.react('❌'); } catch (e) {}
        }
    }
});

async function uploadImagesToAlbum(albumId, pendingData, interaction, albumToken = null) {
    const { images, originalMessage } = pendingData;
    await interaction.editReply({ content: `⏳ กำลังอัปโหลด ${images.length} รูปไปยังอัลบั้ม...`, components: [] });

    try {
        const form = new FormData();
        for (const img of images) {
            const response = await axios.get(img.url, { responseType: 'arraybuffer' });
            form.append('file', Buffer.from(response.data), img.name);
        }

        const headers = { ...form.getHeaders(), 'Authorization': PHOTOS_PASSWORD };
        if (albumToken) headers['x-album-token'] = albumToken;

        await axios.post(`${PHOTOS_API_BASE}/upload/${albumId}`, form, { headers });

        await interaction.editReply({ content: `✅ อัปโหลด ${images.length} รูปเรียบร้อยแล้ว!`, components: [] });
        try { await originalMessage.reactions.removeAll(); await originalMessage.react('✅'); } catch (e) {}
        pendingUploads.delete(interaction.user.id);

    } catch (error) {
        await interaction.editReply({ content: `❌ เกิดข้อผิดพลาดในการอัปโหลด: ${error.message}`, components: [] });
        try { await originalMessage.reactions.removeAll(); await originalMessage.react('❌'); } catch (e) {}
    }
}

async function handleAlbumsCommand(interaction, page = 0) {
    try {
        const response = await axios.get(`${PHOTOS_API_BASE}/albums`);
        const albums = response.data;
        if (albums.length === 0) return interaction.editReply({ content: 'ไม่พบอัลบั้มในระบบ', components: [] });

        const pageSize = 15;
        const totalPages = Math.ceil(albums.length / pageSize);
        if (page < 0) page = 0;
        if (page >= totalPages) page = totalPages - 1;

        const start = page * pageSize;
        const currentAlbums = albums.slice(start, start + pageSize);
        const lines = currentAlbums.map(a => `📂 **${a.name}** ${a.is_locked?'🔒':''} (${a.photo_count} รูป) - [ดูอัลบั้ม](https://next9.yumistack.net/photos/album/?id=${a.id})`);
        
        const components = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cmd_albums_page_${page - 1}`).setLabel('◀️ ก่อนหน้า').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId(`cmd_albums_page_${page + 1}`).setLabel('ถัดไป ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
            );
            components.push(row);
        }

        await interaction.editReply({ content: `**รายชื่ออัลบั้มล่าสุด (หน้า ${page + 1}/${totalPages}):**\n\n${lines.join('\n')}`, components });
    } catch (error) {
        await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการดึงข้อมูลอัลบั้ม', components: [] });
    }
}

client.on('interactionCreate', async interaction => {
    // --- Image Upload Pagination & Search ---
    if (interaction.isButton() && ['upload_page_prev', 'upload_page_next', 'clear_search_btn', 'search_album_btn'].includes(interaction.customId)) {
        const pendingData = pendingUploads.get(interaction.user.id);
        if (!pendingData) return interaction.reply({ content: '❌ ข้อมูลหมดอายุ กรุณาส่งรูปใหม่', ephemeral: true });

        if (interaction.customId === 'search_album_btn') {
            const modal = new ModalBuilder().setCustomId('search_album_modal').setTitle('ค้นหาอัลบั้ม 🔍');
            const searchInput = new TextInputBuilder().setCustomId('search_query').setLabel('พิมพ์ชื่ออัลบั้ม').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
            return interaction.showModal(modal);
        }

        await interaction.deferUpdate();
        if (interaction.customId === 'upload_page_prev') pendingData.currentPage--;
        if (interaction.customId === 'upload_page_next') pendingData.currentPage++;
        if (interaction.customId === 'clear_search_btn') { pendingData.searchQuery = ''; pendingData.currentPage = 0; }

        try {
            const payload = await getUploadMenuPayload(pendingData);
            await interaction.editReply(payload);
        } catch (e) { console.error(e); }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'search_album_modal') {
        const pendingData = pendingUploads.get(interaction.user.id);
        if (!pendingData) return interaction.reply({ content: '❌ ข้อมูลหมดอายุ กรุณาส่งรูปใหม่', ephemeral: true });
        
        await interaction.deferUpdate();
        pendingData.searchQuery = interaction.fields.getTextInputValue('search_query');
        pendingData.currentPage = 0;

        try {
            const payload = await getUploadMenuPayload(pendingData);
            await interaction.editReply(payload);
        } catch (e) { console.error(e); }
    }

    // --- Select Album ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_album') {
        const pendingData = pendingUploads.get(interaction.user.id);
        if (!pendingData) return interaction.reply({ content: '❌ ไม่พบข้อมูลรูปภาพแล้ว กรุณาส่งรูปใหม่', ephemeral: true });
        
        const [albumId, isLocked] = interaction.values[0].split('|');
        if (isLocked === '1') {
            const modal = new ModalBuilder().setCustomId(`unlock_album_${albumId}`).setTitle('อัลบั้มนี้ถูกล็อก 🔒');
            const passInput = new TextInputBuilder().setCustomId('album_password').setLabel('กรุณาใส่รหัสผ่าน').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(passInput));
            return interaction.showModal(modal);
        }

        await interaction.deferUpdate();
        await uploadImagesToAlbum(albumId, pendingData, interaction, null);
    }

    // --- Unlock Album Modal ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('unlock_album_')) {
        const albumId = interaction.customId.replace('unlock_album_', '');
        const password = interaction.fields.getTextInputValue('album_password');
        const pendingData = pendingUploads.get(interaction.user.id);
        if (!pendingData) return interaction.reply({ content: '❌ ไม่พบข้อมูลรูปภาพแล้ว กรุณาส่งรูปใหม่', ephemeral: true });

        try {
            const res = await axios.post(`${PHOTOS_API_BASE}/albums/${albumId}/verify`, { password });
            if (res.data.success) {
                await interaction.deferUpdate();
                await uploadImagesToAlbum(albumId, pendingData, interaction, res.data.token);
            } else {
                await interaction.deferUpdate();
                const originalComponents = interaction.message.components.map(row => ActionRowBuilder.from(row));
                let hasRetry = false;
                for (const row of originalComponents) {
                    for (const comp of row.components) {
                        if (comp.data.custom_id && comp.data.custom_id.startsWith('retry_unlock_')) { hasRetry = true; comp.setCustomId(`retry_unlock_${albumId}`); }
                    }
                }
                if (!hasRetry) originalComponents[originalComponents.length - 1].addComponents(new ButtonBuilder().setCustomId(`retry_unlock_${albumId}`).setLabel('🔑 ใส่รหัสผ่านอีกครั้ง').setStyle(ButtonStyle.Danger));
                await interaction.editReply({ content: `❌ รหัสผ่านไม่ถูกต้อง! กรุณากดปุ่ม 🔑 เพื่อลองใหม่ หรือเลือกอัลบั้มอื่น`, components: originalComponents });
            }
        } catch (error) {
            await interaction.deferUpdate();
            const originalComponents = interaction.message.components.map(row => ActionRowBuilder.from(row));
            let hasRetry = false;
            for (const row of originalComponents) {
                for (const comp of row.components) {
                    if (comp.data.custom_id && comp.data.custom_id.startsWith('retry_unlock_')) { hasRetry = true; comp.setCustomId(`retry_unlock_${albumId}`); }
                }
            }
            if (!hasRetry) originalComponents[originalComponents.length - 1].addComponents(new ButtonBuilder().setCustomId(`retry_unlock_${albumId}`).setLabel('🔑 ใส่รหัสผ่านอีกครั้ง').setStyle(ButtonStyle.Danger));
            await interaction.editReply({ content: `❌ ${error.response?.data?.message || 'เกิดข้อผิดพลาด'} กรุณากดปุ่ม 🔑 เพื่อลองใหม่`, components: originalComponents });
        }
    }

    // --- Retry Unlock Button ---
    if (interaction.isButton() && interaction.customId.startsWith('retry_unlock_')) {
        const albumId = interaction.customId.replace('retry_unlock_', '');
        const modal = new ModalBuilder().setCustomId(`unlock_album_${albumId}`).setTitle('อัลบั้มนี้ถูกล็อก 🔒');
        const passInput = new TextInputBuilder().setCustomId('album_password').setLabel('กรุณาใส่รหัสผ่าน').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(passInput));
        return interaction.showModal(modal);
    }

    // --- Create Album ---
    if (interaction.isButton() && interaction.customId === 'create_album_btn') {
        const modal = new ModalBuilder().setCustomId('create_album_modal').setTitle('สร้างอัลบั้มใหม่');
        const albumNameInput = new TextInputBuilder().setCustomId('album_name').setLabel('ชื่ออัลบั้ม').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(albumNameInput));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'create_album_modal') {
        const albumName = interaction.fields.getTextInputValue('album_name');
        const pendingData = pendingUploads.get(interaction.user.id);

        if (pendingData) await interaction.deferUpdate();
        else await interaction.deferReply({ ephemeral: false });

        try {
            const response = await axios.post(`${PHOTOS_API_BASE}/albums`, { name: albumName }, { headers: { 'Authorization': PHOTOS_PASSWORD } });
            if (response.data && response.data.success) {
                if (pendingData) await uploadImagesToAlbum(response.data.album.id, pendingData, interaction, null);
                else await interaction.editReply(`✅ สร้างอัลบั้ม "${albumName}" สำเร็จ!`);
            } else {
                await interaction.editReply('❌ สร้างอัลบั้มไม่สำเร็จ');
            }
        } catch (error) {
            await interaction.editReply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }

    // --- Slash Commands ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'albums') {
            await interaction.deferReply();
            await handleAlbumsCommand(interaction, 0);
        }
        if (interaction.commandName === 'create_album') {
            const modal = new ModalBuilder().setCustomId('create_album_modal').setTitle('สร้างอัลบั้มใหม่');
            const albumNameInput = new TextInputBuilder().setCustomId('album_name').setLabel('ชื่ออัลบั้ม').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(albumNameInput));
            await interaction.showModal(modal);
        }
    }

    // --- Slash Command Pagination ---
    if (interaction.isButton() && interaction.customId.startsWith('cmd_albums_page_')) {
        const page = parseInt(interaction.customId.replace('cmd_albums_page_', ''));
        await interaction.deferUpdate();
        await handleAlbumsCommand(interaction, page);
    }
});

client.login(process.env.DISCORD_TOKEN).catch(console.error);
