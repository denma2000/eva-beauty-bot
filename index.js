require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// ========== ИНИЦИАЛИЗАЦИЯ БОТА ==========
const bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});

// Идентификация мастера
const MASTER_USERNAME = 'denma2000';
let MASTER_CHAT_ID = null;

// ========== ХРАНИЛИЩА ДАННЫХ ==========
// Активные и подтвержденные записи
const activeBookings = new Map();
const confirmedBookings = new Map();

// Процесс создания/редактирования услуг
const newServiceProcess = new Map();

// Каталог услуг
const services = {
    classic: {
        name: "Маникюр классический",
        price: 1500,
        duration: 60 // минуты
    },
    gel: {
        name: "Маникюр с гель-лаком",
        price: 2500,
        duration: 120
    },
    remove: {
        name: "Снятие гель-лака",
        price: 500,
        duration: 30
    }
};

// Настройки рабочего расписания
const schedule = {
    workHours: {
        start: 10,
        end: 20
    },
    breakHours: {
        start: 13,
        end: 14
    },
    workDays: new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
    customDates: new Map()
};

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
// Форматирование длительности услуги
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
        return `${hours} ч ${mins > 0 ? mins + ' мин' : ''}`;
    }
    return `${mins} мин`;
}

// Форматирование времени
function formatTime(hour) {
    return `${hour.toString().padStart(2, '0')}:00`;
}

// Генерация ключа для новой услуги
function generateServiceKey(name) {
    return name
        .toLowerCase()
        .replace(/[^a-zа-я0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

// Генерация кнопок выбора времени
function generateTimeButtons() {
    const buttons = [];
    let row = [];
    
    for (let hour = 9; hour <= 20; hour++) {
        row.push({
            text: formatTime(hour),
            callback_data: `time_select_${hour}`
        });
        
        if (row.length === 3) {
            buttons.push([...row]);
            row = [];
        }
    }
    
    if (row.length > 0) {
        buttons.push(row);
    }
    
    buttons.push([{
        text: "↩️ Назад",
        callback_data: "schedule_back"
    }]);
    
    return buttons;
}

// Проверка на мастера
function isMaster(username) {
    console.log('Проверка мастера:', username, MASTER_USERNAME, username === MASTER_USERNAME);
    return username === MASTER_USERNAME;
}
```javascript
// ========== ОБРАБОТЧИКИ КОМАНД ==========

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    console.log('Пользователь:', { chatId, username }); // для отладки
    
    if (isMaster(username)) {
        MASTER_CHAT_ID = chatId;
        console.log('Мастер авторизован, ID сохранен:', MASTER_CHAT_ID);
        
        // Меню для мастера
        const keyboard = {
            keyboard: [
                ['👥 Записи на сегодня'],
                ['📅 Все записи'],
                ['⚙️ Управление расписанием'],
                ['💅 Управление услугами']
            ],
            resize_keyboard: true
        };
        
        bot.sendMessage(chatId, 
            'Здравствуйте! Вы вошли как мастер Eva Beauty.\nВыберите действие:',
            {
                reply_markup: keyboard
            }
        );
    } else {
        // Меню для клиентов
        const keyboard = {
            keyboard: [
                ['📝 Записаться на услугу'],
                ['📋 Мои записи', 'ℹ️ О салоне Eva Beauty']
            ],
            resize_keyboard: true
        };
        
        bot.sendMessage(chatId, 
            'Добро пожаловать в Eva Beauty! 💅\nЧем могу помочь?',
            {
                reply_markup: keyboard
            }
        );
    }
});

// ========== УПРАВЛЕНИЕ УСЛУГАМИ ==========

// Обработка кнопки "Управление услугами"
bot.onText(/💅 Управление услугами/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isMaster(username)) return;

    const serviceButtons = Object.entries(services).map(([key, service]) => ([{
        text: `${service.name} (${formatDuration(service.duration)})`,
        callback_data: `service_edit_${key}`
    }]));

    // Добавляем кнопку создания новой услуги
    serviceButtons.push([{
        text: "➕ Добавить новую услугу",
        callback_data: "service_add"
    }]);
    
    const keyboard = {
        inline_keyboard: serviceButtons
    };
    
    bot.sendMessage(chatId, 
        'Управление услугами:\nВыберите услугу для редактирования или добавьте новую:',
        {
            reply_markup: keyboard
        }
    );
});

// Обработка процесса создания/редактирования услуги
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!isMaster(username)) return;
    
    const process = newServiceProcess.get(chatId);
    if (!process) return;
    
    // Обработка ввода названия новой услуги
    if (process.step === 'name' && !process.serviceKey) {
        process.name = msg.text;
        process.step = 'price';
        newServiceProcess.set(chatId, process);
        
        bot.sendMessage(chatId, 
            'Введите стоимость услуги (только число):',
            {
                reply_markup: {
                    force_reply: true
                }
            }
        );
    }
    // Обработка ввода цены новой услуги
    else if (process.step === 'price' && !process.serviceKey) {
        const price = parseInt(msg.text);
        if (isNaN(price)) {
            bot.sendMessage(chatId, 'Пожалуйста, введите корректную стоимость (только число)');
            return;
        }
        
        process.price = price;
        process.step = 'duration';
        newServiceProcess.set(chatId, process);
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: "30 мин", callback_data: "new_duration_30" },
                    { text: "45 мин", callback_data: "new_duration_45" },
                    { text: "60 мин", callback_data: "new_duration_60" }
                ],
                [
                    { text: "90 мин", callback_data: "new_duration_90" },
                    { text: "120 мин", callback_data: "new_duration_120" },
                    { text: "150 мин", callback_data: "new_duration_150" }
                ]
            ]
        };
        
        bot.sendMessage(chatId, 
            'Выберите длительность услуги:',
            {
                reply_markup: keyboard
            }
        );
    }
    // Обработка редактирования названия существующей услуги
    else if (process.step === 'name' && process.serviceKey) {
        const service = services[process.serviceKey];
        service.name = msg.text;
        
        bot.sendMessage(chatId, `
✅ Название услуги обновлено!

📝 Новое название: ${service.name}
💰 Стоимость: ${service.price}₽
⏱ Длительность: ${formatDuration(service.duration)}
        `);
        
        newServiceProcess.delete(chatId);
    }
    // Обработка редактирования цены существующей услуги
    else if (process.step === 'price' && process.serviceKey) {
        const price = parseInt(msg.text);
        if (isNaN(price)) {
            bot.sendMessage(chatId, 'Пожалуйста, введите корректную стоимость (только число)');
            return;
        }
        
        const service = services[process.serviceKey];
        service.price = price;
        
        bot.sendMessage(chatId, `
✅ Стоимость услуги обновлена!

📝 Название: ${service.name}
💰 Новая стоимость: ${service.price}₽
⏱ Длительность: ${formatDuration(service.duration)}
        `);
        
        newServiceProcess.delete(chatId);
    }
});
// ========== ОБРАБОТКА CALLBACK ЗАПРОСОВ ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const username = query.from.username;

    try {
        // Обработка добавления новой услуги
        if (query.data === 'service_add') {
            if (!isMaster(username)) return;
            
            newServiceProcess.set(chatId, {
                step: 'name'
            });
            
            bot.sendMessage(chatId, 
                'Введите название новой услуги:',
                {
                    reply_markup: {
                        force_reply: true
                    }
                }
            );
        }
        
        // Обработка редактирования существующей услуги
        else if (query.data.startsWith('service_edit_')) {
            if (!isMaster(username)) return;
            
            const serviceKey = query.data.split('_')[2];
            const service = services[serviceKey];
            
            const keyboard = {
                inline_keyboard: [
                    [{ 
                        text: "✏️ Изменить название", 
                        callback_data: `edit_name_${serviceKey}` 
                    }],
                    [{ 
                        text: "💰 Изменить цену", 
                        callback_data: `edit_price_${serviceKey}` 
                    }],
                    [{ 
                        text: "⏱ Изменить длительность", 
                        callback_data: `edit_duration_${serviceKey}` 
                    }],
                    [{ 
                        text: "🗑 Удалить услугу", 
                        callback_data: `delete_service_${serviceKey}` 
                    }],
                    [{ 
                        text: "↩️ Назад", 
                        callback_data: "services_back" 
                    }]
                ]
            };
            
            bot.sendMessage(chatId, `
Редактирование услуги:

📝 Название: ${service.name}
💰 Стоимость: ${service.price}₽
⏱ Длительность: ${formatDuration(service.duration)}

Выберите действие:
            `, {
                reply_markup: keyboard
            });
        }
        
        // Обработка начала редактирования названия/цены
        else if (query.data.startsWith('edit_name_') || query.data.startsWith('edit_price_')) {
            if (!isMaster(username)) return;
            
            const [action, field, serviceKey] = query.data.split('_');
            const service = services[serviceKey];
            
            newServiceProcess.set(chatId, {
                step: field,
                serviceKey: serviceKey,
                currentService: service
            });
            
            bot.sendMessage(chatId, 
                `Введите новое ${field === 'name' ? 'название' : 'стоимость'} для услуги "${service.name}":`,
                {
                    reply_markup: {
                        force_reply: true
                    }
                }
            );
        }
        
        // Обработка редактирования длительности
        else if (query.data.startsWith('edit_duration_')) {
            if (!isMaster(username)) return;
            
            const serviceKey = query.data.split('_')[2];
            const service = services[serviceKey];
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: "30 мин", callback_data: `set_duration_${serviceKey}_30` },
                        { text: "45 мин", callback_data: `set_duration_${serviceKey}_45` },
                        { text: "60 мин", callback_data: `set_duration_${serviceKey}_60` }
                    ],
                    [
                        { text: "90 мин", callback_data: `set_duration_${serviceKey}_90` },
                        { text: "120 мин", callback_data: `set_duration_${serviceKey}_120` },
                        { text: "150 мин", callback_data: `set_duration_${serviceKey}_150` }
                    ]
                ]
            };
            
            bot.sendMessage(chatId, `
Выберите новую длительность для услуги "${service.name}"
Текущая длительность: ${formatDuration(service.duration)}
            `, {
                reply_markup: keyboard
            });
        }
        
        // Обработка установки новой длительности
        else if (query.data.startsWith('set_duration_')) {
            if (!isMaster(username)) return;
            
            const [_, __, serviceKey, duration] = query.data.split('_');
            const service = services[serviceKey];
            
            service.duration = parseInt(duration);
            
            bot.sendMessage(chatId, `
✅ Длительность услуги обновлена!

📝 Название: ${service.name}
⏱ Новая длительность: ${formatDuration(service.duration)}
            `);
        }
        
        // Обработка удаления услуги
        else if (query.data.startsWith('delete_service_')) {
            if (!isMaster(username)) return;
            
            const serviceKey = query.data.split('_')[2];
            const service = services[serviceKey];
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: "✅ Да, удалить", callback_data: `confirm_delete_${serviceKey}` },
                        { text: "❌ Нет, отмена", callback_data: "services_back" }
                    ]
                ]
            };
            
            bot.sendMessage(chatId, `
❗️ Подтвердите удаление услуги:

📝 Название: ${service.name}
💰 Стоимость: ${service.price}₽
⏱ Длительность: ${formatDuration(service.duration)}

Вы уверены?
            `, {
                reply_markup: keyboard
            });
        }
        
        // Подтверждение удаления услуги
        else if (query.data.startsWith('confirm_delete_')) {
            if (!isMaster(username)) return;
            
            const serviceKey = query.data.split('_')[2];
            const service = services[serviceKey];
            const serviceName = service.name;
            
            delete services[serviceKey];
            
            bot.sendMessage(chatId, `✅ Услуга "${serviceName}" удалена`);
            
            // Показываем обновленный список услуг
            const serviceButtons = Object.entries(services).map(([key, service]) => ([{
                text: `${service.name} (${formatDuration(service.duration)})`,
                callback_data: `service_edit_${key}`
            }]));
            
            serviceButtons.push([{
                text: "➕ Добавить новую услугу",
                callback_data: "service_add"
            }]);
            
            const keyboard = {
                inline_keyboard: serviceButtons
            };
            
            bot.sendMessage(chatId, 
                'Управление услугами:\nВыберите услугу для редактирования или добавьте новую:',
                {
                    reply_markup: keyboard
                }
            );
        }

        // Возврат к списку услуг
        else if (query.data === 'services_back') {
            const serviceButtons = Object.entries(services).map(([key, service]) => ([{
                text: `${service.name} (${formatDuration(service.duration)})`,
                callback_data: `service_edit_${key}`
            }]));
            
            serviceButtons.push([{
                text: "➕ Добавить новую услугу",
                callback_data: "service_add"
            }]);
            
            const keyboard = {
                inline_keyboard: serviceButtons
            };
            
            bot.sendMessage(chatId, 
                'Управление услугами:\nВыберите услугу для редактирования или добавьте новую:',
                {
                    reply_markup: keyboard
                }
            );
        }

    } catch (error) {
        console.error('Ошибка:', error);
        bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// ========== ЗАПУСК БОТА ==========
console.log('Бот Eva Beauty запущен...');
