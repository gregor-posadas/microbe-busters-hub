# Microbe Busters Hub

A small assignment board for the Quito irrigation project team. Each person has a card with their assignments, due dates, instructions and a link to the right Google Doc. The project manager gets a view of everything, the backend keeps every deadline on one shared Google Calendar and sends quiet reminder emails with links straight to each item, and the weekly client meeting gets its own page with the Meet link, a prepared agenda and notes doc, topic suggestions and a one-click agenda email.

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages. No build step.
- **Data:** the Google Sheet "Microbe Busters Hub data" in the team Drive folder. Nothing about the team is stored in this repository.
- **Backend:** a Google Apps Script web app attached to that Sheet. It reads and writes the Sheet, adds deadlines to Google Calendar, emails reminders, lists files from the team Drive folder, and reads the weekly meeting from Google Calendar to prepare each meeting's doc.
- **Font:** Atkinson Hyperlegible Next, under the SIL Open Font License (`fonts/OFL.txt`).

Until the backend is connected, the site runs on sample data from `data/demo.json`, so you can look around first. The sample uses first names only, with no emails, Google Doc links or outside contacts; the real details live in the Sheet.

## Set up the backend (about 10 minutes, once)

1. Open the Sheet **Microbe Busters Hub data** in the Quito Irrigation Project Drive folder.
2. Go to **Extensions > Apps Script**. Delete whatever is in `Code.gs` and paste in the contents of `apps-script/Code.gs` from this repository.
3. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Back in the editor, open `appsscript.json` and replace it with `apps-script/appsscript.json`. Save.
4. In the function menu at the top, pick `setup` and click **Run**. Approve the permissions when Google asks (Sheets, Calendar, Drive read-only, send email).
   - This creates a calendar called "Microbe Busters deadlines", a daily 8 AM reminder, a meeting refresh at 6 AM and 6 PM, and two access codes. It also reads the weekly meeting from your Google Calendar right away.
   - The manifest turns on the Google Calendar advanced service, which is how the hub gets the Meet link. If Google asks, allow it under **Services**.
   - Open **Execution log** to see the codes. The **team code** is for everyone. The **project manager code** is for you only.
   - Lost them? They are under **Project Settings > Script properties** (`TEAM_CODE`, `PM_CODE`).
5. Still in **Script properties**, add `APP_URL` with your GitHub Pages address (for example `https://yourname.github.io/microbe-busters-hub/`). Reminder emails and calendar events link back to it.
6. Pick `syncAllCalendarEvents` and **Run**. This puts every assignment and team deadline on the shared "Microbe Busters deadlines" calendar. No one is invited and no emails are sent.
7. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Copy the URL that ends in `/exec`.
8. In this repository, open `assets/config.js` and paste that URL into `apiUrl`. Commit. The site switches from sample data to the Sheet.
9. Send the site link and the team code to the team.

When you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the `/exec` URL stays the same.

### If "Anyone" is not offered

Some university Google accounts only allow web apps for people signed in to that university. The GitHub Pages site can't use such a backend, because browsers don't send your Google sign-in from one site to another. The fix is to serve the site from the Apps Script web app itself instead of GitHub Pages. That needs a small code change, so stop at this step and ask for it rather than choosing a narrower option.

## Meetings

- The hub reads the event called **Microbe Busters and Christopher Weekly Meeting** from the Google Calendar of whoever deployed the backend. Muthoni owns the event, so moves and cancellations there flow into the hub at 6 AM and 6 PM (or right away with **Refresh meetings from Google Calendar** in Project view).
- A week before each meeting, the hub copies **_Master for automatic meeting docs** in the Meetings folder into a new doc named with the meeting date, the same way as last week's doc. It fills in the date, time, Meet link, agenda due time, next meeting and a link to last meeting's notes, then gives Muthoni an agenda assignment (due 9 PM the day before) and Leakey a notes assignment (due noon the day after).
- To change what every meeting doc looks like, edit the master doc. Keep the placeholders in double braces: `{{DATE}}`, `{{WHEN}}`, `{{MEET}}`, `{{AGENDA_DUE}}`, `{{NEXT_WHEN}}` and `{{PREV_LINK}}`, and keep the headings **Agenda** and **Suggested by the team**, because topic suggestions and the agenda email look for them.
- **Suggest a topic** on the Meetings page adds a bullet under Suggested by the team in that meeting's doc.
- **Share the agenda** emails the numbered list from the doc's Agenda section to the team (and to the client if the box is ticked), with the Meet link, and marks Muthoni's agenda assignment done.
- Settings such as the event title, the master doc, the folder, and the meeting lead and note-taker are at the top of `Code.gs` in `MEETING_DEFAULTS`. The client's email comes from the calendar event's guests, so it isn't stored in this repository. Any of them can be overridden in **Script properties** without editing code.

## Using it

- **Everyone:** open the site, enter the team code once, and tap your name. Each assignment shows what to do, when it is due, and a button that opens the document. Mark it **In progress** or **Done** when that is true. That is the only thing teammates change.
- **Project manager:** open **Project view**. The first edit asks for the project manager code, which the browser then remembers until you choose **Forget the project manager code on this device**. From there you can add an assignment for one or several people at once (each gets their own instructions), edit or delete assignments, add projects, and send reminders on demand.
- **Team deadlines:** class assignments and other whole-team due dates. They show on the milestone line on the Team page and at the bottom of everyone's list. Each one has its own page with what the class asks for, an **Open on bCourses** button, and who is doing which part. Once the team turns it in, anyone can click **Mark as submitted** so it drops off everyone's list.
- **Deliverables:** what we owe Christopher (agreed, not confirmed yet, on hold) kept apart from DevEng C200 assignments. Everywhere else, client work carries a filled **For Christopher** tag and class work an outlined **DevEng C200** tag.
- **Meetings:** the next meeting with **Join Google Meet** and the agenda and notes doc, Muthoni's three steps, suggested topics, and past meetings' notes.
- **Light and dark mode:** the site follows the device's setting; the button at the top right switches and remembers the choice. Light mode uses a warm off-white.
- **About:** how each role uses the hub, what the symbols mean, and answers to common questions.
- **Files:** lists what is in the team Drive folder, grouped by subfolder, with search.

### Reminders

- Emails come from the hub (the university no-reply address when Google allows it), at 8 AM Pacific, at most once a day per person, and only on days with something to say.
- Each email lists what's **overdue**, what's **due soon** (next 2 days), what's **new for you** since the last email, and any **team deadline** in the next 2 days. Every item links straight to its page in the hub, with a second link to its document.
- Overdue items come up the day after they're due, then every third day, so nobody gets nagged daily.
- Each person chooses **Daily**, **Mondays only** (one email with the whole week) or **Off** at the bottom of their own page. The link at the end of every email goes there.
- The project manager also gets a team summary on days with something in it.
- Every assignment and team deadline is an event on the shared "Microbe Busters deadlines" calendar, titled with the person's name, for example "Due (Ben): ...". No one is invited, so nothing lands on personal calendars. Share that calendar read-only with anyone who wants to see it. Anyone can also add a single deadline to their own calendar with **Add to Google Calendar** on its page.

### Editing the Sheet directly

You can also edit the Sheet by hand. Keep dates in the form `2026-10-06T23:59:00-07:00` (use `-08:00` after daylight saving time ends on Nov 1). Status is one of `todo`, `doing` or `done`. Instructions and project descriptions use one line per step, starting with `- `. For a link, paste the address or write `[link text](https://...)`. A line starting with `### ` becomes a small heading. In **Projects**, put the bCourses page in `courseLink`; `status` is empty or `done` (submitted or delivered); `audience` is `client`, `class` or empty; and for client work `scope` is `confirmed`, `to-confirm` or `on-hold`. Unconfirmed and on-hold deliverables stay off calendars, reminders and everyone's lists. In **Milestones**, `projectId` makes that stop on the milestone line open the project's page. After editing dates by hand, run `syncAllCalendarEvents` again to update the calendar events.

## Files in this repository

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `assets/app.js` | All site behavior (views, routing, calls to the backend) |
| `assets/styles.css` | Styles, including the dark theme |
| `assets/config.js` | The backend URL and time zone |
| `apps-script/` | Backend code to paste into Apps Script |
| `data/demo.json` | Sample data used when no backend is connected |
| `fonts/` | Atkinson Hyperlegible Next and its license |

## Publishing changes

Before each commit, run `sh scripts/stamp-version.sh` from the repo root. It writes a new version number into `version.json`, `index.html` and `assets/app.js`. Browsers then fetch the new files instead of cached ones, and anyone with the hub already open gets a **Reload to get the new version** bar when they come back to the tab. If you edit a file directly on GitHub instead, also bump the number in `version.json` by hand so open copies notice the change.
