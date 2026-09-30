# Microbe Busters Hub

A small assignment board for the Quito irrigation project team. Each person has a card with their assignments, due dates, instructions and a link to the right Google Doc. The project manager gets a view of everything, the backend sends calendar invites and daily email reminders, and the weekly client meeting gets its own page with the Meet link, a prepared agenda and notes doc, topic suggestions and a one-click agenda email.

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages. No build step.
- **Data:** the Google Sheet "Microbe Busters Hub data" in the team Drive folder. Nothing about the team is stored in this repository.
- **Backend:** a Google Apps Script web app attached to that Sheet. It reads and writes the Sheet, sends Google Calendar invites, emails reminders, lists files from the team Drive folder, and reads the weekly meeting from Google Calendar to prepare each meeting's doc.
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
5. Still in **Script properties**, add `APP_URL` with your GitHub Pages address (for example `https://yourname.github.io/microbe-busters-hub/`). Reminder emails and calendar invites link back to it.
6. Pick `syncAllCalendarEvents` and **Run**. This sends a calendar invite to each person for their assignments, and invites the whole team to each team deadline (class assignments and the final presentation) already in the Sheet.
7. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Copy the URL that ends in `/exec`.
8. In this repository, open `assets/config.js` and paste that URL into `apiUrl`. Commit. The site switches from sample data to the Sheet.
9. Send the site link and the team code to the team.

When you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the `/exec` URL stays the same.

### If "Anyone" is not offered

Some university Google accounts only allow web apps for people signed in to that university. If **Anyone** is missing, pick **Anyone within UC Berkeley**. The site will then only load for teammates who are signed in to their Berkeley Google account in the same browser. If that still fails, deploy the Apps Script from a personal Gmail account instead: make a copy of the Sheet there, share it back with the team, and repeat the steps above.

## Meetings

- The hub reads the event called **Microbe Busters and Christopher Weekly Meeting** from the Google Calendar of whoever deployed the backend. Mary owns the event, so moves and cancellations there flow into the hub at 6 AM and 6 PM (or right away with **Refresh meetings from Google Calendar** in Project view).
- A week before each meeting, the hub copies **_Master for automatic meeting docs** in the Meetings folder into a new doc named with the meeting date, the same way as last week's doc. It fills in the date, time, Meet link, agenda due time, next meeting and a link to last meeting's notes, then gives Mary an agenda assignment (due 9 PM the day before) and Leakey a notes assignment (due noon the day after).
- To change what every meeting doc looks like, edit the master doc. Keep the placeholders in double braces: `{{DATE}}`, `{{WHEN}}`, `{{MEET}}`, `{{AGENDA_DUE}}`, `{{NEXT_WHEN}}` and `{{PREV_LINK}}`, and keep the headings **Agenda** and **Suggested by the team**, because topic suggestions and the agenda email look for them.
- **Suggest a topic** on the Meetings page adds a bullet under Suggested by the team in that meeting's doc.
- **Share the agenda** emails the numbered list from the doc's Agenda section to the team (and to the client if the box is ticked), with the Meet link, and marks Mary's agenda assignment done.
- Settings such as the event title, the master doc, the folder, and the meeting lead and note-taker are at the top of `Code.gs` in `MEETING_DEFAULTS`. The client's email comes from the calendar event's guests, so it isn't stored in this repository. Any of them can be overridden in **Script properties** without editing code.

## Using it

- **Everyone:** open the site, enter the team code once, and tap your name. Each assignment shows what to do, when it is due, and a button that opens the document. Mark it **In progress** or **Done** when that is true. That is the only thing teammates change.
- **Project manager:** open **Project view**. The first edit asks for the project manager code, which the browser then remembers until you choose **Forget the project manager code on this device**. From there you can add an assignment for one or several people at once (each gets their own instructions), edit or delete assignments, add projects, and send reminders on demand.
- **Team deadlines:** class assignments and other whole-team due dates. They show on the milestone line on the Team page and at the bottom of everyone's list. Each one has its own page with what the class asks for, an **Open on bCourses** button, and who is doing which part. Once the team turns it in, anyone can click **Mark as submitted** so it drops off everyone's list.
- **Meetings:** the next meeting with **Join Google Meet** and the agenda and notes doc, Mary's three steps, suggested topics, and past meetings' notes.
- **About:** how each role uses the hub, what the symbols mean, and answers to common questions.
- **Files:** lists what is in the team Drive folder, grouped by subfolder, with search.

### Reminders

- Every morning at 8 AM Pacific, each person with something due in the next 2 days, or overdue, gets one email listing it.
- The project manager gets a summary: what is overdue, what is due in the next 7 days and what was finished yesterday.
- Team deadlines due in the next 2 days go to everyone, and the project manager summary lists any team deadline in the next 7 days, or one that passed without being marked submitted.
- Every assignment with a due date also becomes a 30-minute event on the "Microbe Busters deadlines" calendar, ending at the due time, with the assignee invited. Google Calendar's own notifications take it from there.

### Editing the Sheet directly

You can also edit the Sheet by hand. Keep dates in the form `2026-10-06T23:59:00-07:00` (use `-08:00` after daylight saving time ends on Nov 1). Status is one of `todo`, `doing` or `done`. Instructions and project descriptions use one line per step, starting with `- `. For a link, paste the address or write `[link text](https://...)`. A line starting with `### ` becomes a small heading. In **Projects**, put the bCourses page in `courseLink`, and `status` is empty or `done` (submitted). In **Milestones**, `projectId` makes that stop on the milestone line open the project's page. After editing dates by hand, run `syncAllCalendarEvents` again to update the calendar invites.

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
