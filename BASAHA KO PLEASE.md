
# Hotel Billing System

Usa ka web-based Hotel Billing System nga gihimo aron madumala ang walk-in guests, room assignments, billing, payments, ug uban pang hotel operations.

## Installation ug Setup Guide

Sunda ang mga lakang sa ubos aron ma-download ug ma-run ang Hotel Billing System sa imong local computer.

## 1. Mga Kinahanglan nga Applications

Siguroha nga naka-install na ang mosunod:

- [Git](https://git-scm.com/downloads)
- [Visual Studio Code](https://code.visualstudio.com/)
- [XAMPP](https://www.apachefriends.org/)
- [Node.js](https://nodejs.org/)
- Google Chrome o bisan unsang web browser

## 2. Pag-download sa GitHub Repository

1. Log in sa imong GitHub account.
2. Ablihi ang Git Bash o Command Prompt.
3. Adto sa Desktop pinaagi sa command:

   ```bash
   cd Desktop
   ```

4. I-clone ang repository gamit kini nga command:

   ```bash
   git clone https://github.com/esphyrho27/Hotel-Billing-System.git
   ```

5. Ablihi ang Visual Studio Code.
6. Pilia ang **File → Open Folder**.
7. Pangitaa ug pilia ang `Hotel-Billing-System` folder.

## 3. Pag-setup sa PHP API

1. Pangitaa ang `api-hotel` folder sulod sa na-download nga repository.
2. I-copy ang tibuok `api-hotel` folder.
3. I-paste kini sulod sa XAMPP `htdocs` directory.

Lokasyon sa folder:

```text
C:\xampp\htdocs\api-hotel
```

## 4. Pag-configure sa Environment File

1. Adto sa:

   ```text
   C:\xampp\htdocs\api-hotel
   ```

2. Pangitaa ang `.env.example` file.
3. Paghimo og kopya niini.
4. Ilisi ang ngalan sa gikopyang file ngadto sa `.env`.
5. I-update ang environment variables base sa imong local database configuration.

**Importante:** Ayaw i-upload ang imong actual `.env` file o database credentials sa GitHub aron maprotektahan ang imong database information.

## 5. Pag-import sa Database

1. Ablihi ang XAMPP Control Panel.
2. I-start ang **Apache** ug **MySQL**.
3. Ablihi ang imong browser.
4. Adto sa:

   ```text
   http://localhost/phpmyadmin
   ```

5. Paghimo o pilia ang database nga gigamit sa project.
6. Pangitaa ang `database` folder sulod sa repository.
7. Pangitaa ang SQL database file.
8. I-import ang SQL file gamit ang phpMyAdmin.

## 6. Pag-configure sa Local IP Address

Kinahanglan ilisan ang mga daang IP address sa mosunod nga files aron mo-match sa current IPv4 address sa imong computer.

### Mga Files nga Kinahanglan Ilisan ang IP Address

| File | Lokasyon |
|---|---|
| `hotel_billing_walkin.js` | Project source files |
| `LegacyDashboard.js` | Project source files |
| `config.php` | `C:\xampp\htdocs\` |

### Unsaon Pagpangita sa Local IP Address

1. Ablihi ang Command Prompt.
2. I-type ang command:

   ```bash
   ipconfig
   ```

3. Pangitaa ang **IPv4 Address** ubos sa imong active Wi-Fi o Ethernet adapter.

Pananglitan:

```text
IPv4 Address: 192.168.1.100
```

4. Ilisi ang daang IP address sa tulo ka files nga naa sa listahan gamit ang imong current IPv4 address.
5. I-save ang tanang changes.

**Note:** Kung mobalhin ka og laing Wi-Fi network, posible nga mausab ang imong local IP address. Kinahanglan i-update usab ang IP address sa mga files kung mausab kini.

## 7. Pagpadagan sa System

Human mahuman ang tanang setup:

1. Siguroha nga naka-run ang Apache ug MySQL sa XAMPP.
2. Ablihi ang project folder sa Visual Studio Code.
3. Ablihi ang terminal.
4. I-install ang project dependencies:

   ```bash
   npm install
   ```

5. I-run ang development server:

   ```bash
   npm run dev
   ```

6. Ablihi ang browser ug adto sa:

   ```text
   http://localhost:3000
   ```

### PHP API Access

Ang PHP API mahimong ma-access pinaagi niini nga URL:

```text
http://localhost/api-hotel/
```

## 8. Troubleshooting

| Problema | Posibleng Solusyon |
|---|---|
| API connection error | Siguroha nga naka-run ang Apache ug sakto ang IP address sa configuration files. |
| Database connection failed | Susiha kung naka-run ang MySQL ug sakto ang database credentials. |
| Database not found | Siguroha nga sakto ang pag-import sa SQL file. |
| Frontend dili maka-connect sa API | Susiha ang API URL ug local IP configuration. |
| npm command not recognized | I-install ang Node.js ug i-restart ang terminal. |
| Apache cannot start | Susiha kung naay port conflict, labi na sa port 80. |

## Importanteng mga Pahinumdom

- Kini nga project gi-configure para sa local development.
- Siguroha nga naka-run ang Apache ug MySQL sa dili pa ablihan ang system.
- Ayaw ipaambit sa uban ang imong database credentials.
- Gamita ang sakto nga local IPv4 address sa pag-configure sa API connections.
- Ayaw i-commit sa GitHub ang `.env` file nga adunay sensitive information.

## GitHub Repository

https://github.com/esphyrho27/Hotel-Billing-System.git


-pnkyws4ll