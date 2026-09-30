/**
 * Microbe Busters Hub: backend.
 *
 * Paste this file into the Apps Script editor of the "Microbe Busters Hub data"
 * Google Sheet (Extensions > Apps Script), run setup() once, then deploy as a web app.
 * Full steps are in README.md.
 *
 * What it does:
 *  - Serves the team's members, projects, assignments and Drive files to the website.
 *  - Saves status changes and project manager edits back to the Sheet.
 *  - Sends a Google Calendar invite for each assignment's due date, and invites
 *    the whole team to each project deadline (class assignments, presentations).
 *  - Emails a reminder every morning to anyone with work due within 2 days or overdue,
 *    plus a summary for the project manager.
 */

var TZ = 'America/Los_Angeles';
var TABS = {
  Members: ['id', 'name', 'email', 'role', 'color', 'textColor'],
  Projects: ['id', 'name', 'due', 'link', 'description', 'courseLink', 'status', 'calendarEventId'],
  Assignments: ['id', 'projectId', 'memberId', 'title', 'instructions', 'due', 'link', 'linkLabel', 'status', 'updatedAt', 'updatedBy', 'calendarEventId'],
  Milestones: ['date', 'label', 'dateLabel', 'projectId'],
  Meetings: ['id', 'start', 'end', 'title', 'meetLink', 'docUrl', 'agendaSharedAt', 'agendaSharedBy', 'eventId'],
  Topics: ['id', 'meetingId', 'text', 'memberId', 'createdAt'],
  Log: ['timestamp', 'who', 'action', 'detail']
};

/* Meeting settings. Each can be overridden in Project Settings > Script properties. */
var MEETING_DEFAULTS = {
  MEETING_QUERY: 'Microbe Busters and Christopher Weekly Meeting', // calendar event title to look for
  MEETING_MASTER_ID: '1Cw9RMtWelybUkrg_wwWCD6TyIWHJOeFH2UzqBmJDxYc', // "_Master for automatic meeting docs"
  MEETINGS_FOLDER_ID: '1k2vkJJf-pYnd7YWXDp-FBlHh8pFhvqfz',           // Meetings folder in the team Drive
  MEETING_DOC_NAME: '',   // docs are named "<date> <this>"; empty = reuse the name of last meeting's doc
  MEETING_LEAD: 'mary',
  NOTE_TAKER: 'leakey',
  CLIENT_EMAIL: '',       // empty = the meeting's calendar guests who aren't on the team
  MEET_LINK: '',          // used only if the calendar event has no Meet link
  PREP_DAYS: '7'          // make the doc this many days ahead
};
// Keep these in step with MEET_AGENDA_STEPS and MEET_NOTES_STEPS in tools/seed.py.
var MEETING_STEPS = {
  agenda: '- Open the meeting doc. The date, Meet link and next meeting are already filled in.\n' +
    '- In the Agenda section, list 3 to 5 topics, each with who leads it and how many minutes.\n' +
    '- Move any topics under Suggested by the team into the agenda, or leave them for a later week.\n' +
    '- On the Meetings page of the hub, click Share the agenda. It emails the team and marks this done.',
  notes: '- During the meeting, take notes in the meeting doc under Discussion points, Decisions and Action items.\n' +
    '- Within 24 hours, merge the Meetily summary and give every action item an owner and a due date.\n' +
    '- Tell Gregor which action items should become assignments in the hub.'
};
function setting(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || MEETING_DEFAULTS[key] || '';
}
var STATUSES = ['todo', 'doing', 'done'];

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Creates tabs, the deadlines calendar, the daily trigger and access codes. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = TABS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });

  if (!props.getProperty('CALENDAR_ID')) {
    var cal = CalendarApp.createCalendar('Microbe Busters deadlines', { timeZone: TZ, color: CalendarApp.Color.BLUE });
    props.setProperty('CALENDAR_ID', cal.getId());
  }
  if (!props.getProperty('TEAM_CODE')) props.setProperty('TEAM_CODE', randomCode());
  if (!props.getProperty('PM_CODE')) props.setProperty('PM_CODE', randomCode() + '-' + randomCode());
  if (!props.getProperty('PM_EMAIL')) props.setProperty('PM_EMAIL', Session.getActiveUser().getEmail());
  if (!props.getProperty('FOLDER_ID')) props.setProperty('FOLDER_ID', '111V21adIMD5Vjv86bWAcW2S52mSYr8FY');

  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('sendDailyReminders') < 0) {
    ScriptApp.newTrigger('sendDailyReminders').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  }
  // Meetings: refresh from Google Calendar and prepare the next meeting doc, every morning and evening.
  if (handlers.indexOf('syncMeetings') < 0) {
    ScriptApp.newTrigger('syncMeetings').timeBased().everyDays(1).atHour(6).inTimezone(TZ).create();
    ScriptApp.newTrigger('syncMeetings').timeBased().everyDays(1).atHour(18).inTimezone(TZ).create();
  }
  try { syncMeetings(); } catch (e) { Logger.log('Meeting sync failed: ' + e.message); }

  Logger.log('Setup done.');
  Logger.log('Team code (share with the team): ' + props.getProperty('TEAM_CODE'));
  Logger.log('Project manager code (keep to yourself): ' + props.getProperty('PM_CODE'));
  Logger.log('Next: set APP_URL in Project Settings > Script properties to your GitHub Pages address, then deploy as a web app.');
}

/** Optional, run once after setup (and again after editing the Sheet by hand):
 *  sends calendar invites for assignments and project deadlines already in the Sheet. */
function syncAllCalendarEvents() {
  var rows = readTable('Assignments');
  rows.forEach(function (a) {
    if (a.status === 'done' || !a.due) return;
    var id = syncCalendar(a);
    if (id !== a.calendarEventId) { a.calendarEventId = id; writeRow('Assignments', a); }
  });
  var projects = readTable('Projects');
  projects.forEach(function (p) {
    if (p.status === 'done' || !p.due) return;
    var id = syncProjectCalendar(p);
    if (id !== p.calendarEventId) { p.calendarEventId = id; writeRow('Projects', p); }
  });
  Logger.log('Calendar invites synced for ' + rows.length + ' assignments and ' + projects.length + ' projects.');
}

function randomCode() {
  var words = ['canal', 'river', 'glacier', 'drip', 'filter', 'pond', 'harvest', 'quito', 'pisque', 'cayambe', 'furrow', 'valve'];
  return words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(1000 + Math.random() * 9000);
}

/* ------------------------------------------------------------------ web app */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'data') {
      checkCode(p.code, 'team');
      return json({ ok: true, data: payload() });
    }
    return json({ ok: true, service: 'Microbe Busters Hub' });
  } catch (err) {
    return json({ ok: false, error: err.message, code: err.codeType || '' });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    lock.waitLock(20000);
    var who = String(b.who || '');
    switch (b.action) {
      case 'setStatus':
        checkCode(b.code, 'team');
        return json(setStatus(b.id, b.status, who));
      case 'saveAssignments':
        checkCode(b.pmCode, 'pm');
        return json(saveAssignments(b.assignments || [], who));
      case 'deleteAssignment':
        checkCode(b.pmCode, 'pm');
        return json(deleteAssignment(b.id, who));
      case 'saveProject':
        checkCode(b.pmCode, 'pm');
        return json(saveProject(b.project || {}, who));
      case 'setProjectStatus':
        checkCode(b.code, 'team');
        return json(setProjectStatus(b.id, b.status, who));
      case 'addTopic':
        checkCode(b.code, 'team');
        return json(addTopic(b.meetingId, b.text, who));
      case 'shareAgenda':
        checkCode(b.code, 'team');
        return json(shareAgenda(b.meetingId, !!b.includeClient, who));
      case 'syncMeetings':
        checkCode(b.pmCode, 'pm');
        return json({ ok: true, meetings: syncMeetings() });
      case 'sendReminders':
        checkCode(b.pmCode, 'pm');
        return json({ ok: true, sent: sendDailyReminders() });
      default:
        throw new Error('Unknown action.');
    }
  } catch (err) {
    return json({ ok: false, error: err.message, code: err.codeType || '' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkCode(code, level) {
  var props = PropertiesService.getScriptProperties();
  var pm = props.getProperty('PM_CODE'), team = props.getProperty('TEAM_CODE');
  var ok = level === 'pm' ? code && code === pm : code && (code === team || code === pm);
  if (!ok) {
    var err = new Error(level === 'pm' ? 'The project manager code is wrong.' : 'The team code is wrong.');
    err.codeType = level;
    throw err;
  }
}

/* ------------------------------------------------------------------ data */

function sheet(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return ss.getSheetByName(name);
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return v === null || v === undefined ? '' : String(v);
}

function readTable(name) {
  var sh = sheet(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), TABS[name].length).getValues();
  var head = values.shift();
  return values.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = cell(r[i]); });
    return o;
  });
}

function writeRow(name, obj) {
  var sh = sheet(name), head = TABS[name];
  var row = head.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var i = ids.indexOf(String(obj[head[0]]));
  var range = i > -1 ? sh.getRange(i + 2, 1, 1, head.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, head.length);
  range.setNumberFormat('@').setValues([row]);
}

function deleteRow(name, id) {
  var sh = sheet(name);
  if (sh.getLastRow() < 2) return;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var i = ids.indexOf(String(id));
  if (i > -1) sh.deleteRow(i + 2);
}

function log(who, action, detail) {
  sheet('Log').appendRow([cell(new Date()), who || '', action, detail || '']);
}

function payload() {
  var members = readTable('Members').map(function (m) {
    return { id: m.id, name: m.name, email: m.email, role: m.role, color: m.color, textColor: m.textColor };
  });
  return {
    members: members,
    projects: readTable('Projects'),
    assignments: readTable('Assignments'),
    milestones: readTable('Milestones'),
    meetings: readTable('Meetings').sort(function (a, b) { return a.start < b.start ? -1 : 1; }),
    topics: readTable('Topics'),
    files: listFiles(),
    generated: cell(new Date())
  };
}

/* ------------------------------------------------------------------ actions */

function setStatus(id, status, who) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  var a = findAssignment(id);
  a.status = status;
  a.updatedAt = cell(new Date());
  a.updatedBy = who;
  writeRow('Assignments', a);
  log(who, 'status', a.title + ' -> ' + status);
  return { ok: true, assignment: a };
}

function saveAssignments(list, who) {
  var members = indexBy(readTable('Members'));
  var saved = list.map(function (input) {
    if (!input.title || !String(input.title).trim()) throw new Error('Every assignment needs a title.');
    if (!members[input.memberId]) throw new Error('Unknown team member: ' + input.memberId);
    var existing = input.id ? findAssignment(input.id, true) : null;
    var a = {
      id: input.id || 'a-' + Utilities.getUuid().slice(0, 8),
      projectId: input.projectId || '',
      memberId: input.memberId,
      title: String(input.title).trim(),
      instructions: input.instructions || '',
      due: input.due || '',
      link: /^https?:\/\//i.test(input.link || '') ? input.link : '',
      linkLabel: input.linkLabel || '',
      status: existing ? existing.status : (STATUSES.indexOf(input.status) > -1 ? input.status : 'todo'),
      updatedAt: cell(new Date()),
      updatedBy: who,
      calendarEventId: existing ? existing.calendarEventId : ''
    };
    // A new person or a new due date means a fresh invite.
    if (existing && existing.memberId !== a.memberId) { removeEvent(existing.calendarEventId); a.calendarEventId = ''; }
    a.calendarEventId = syncCalendar(a);
    writeRow('Assignments', a);
    log(who, existing ? 'edit' : 'create', a.title + ' (' + a.memberId + ')');
    return a;
  });
  return { ok: true, assignments: saved };
}

function deleteAssignment(id, who) {
  var a = findAssignment(id);
  removeEvent(a.calendarEventId);
  deleteRow('Assignments', id);
  log(who, 'delete', a.title + ' (' + a.memberId + ')');
  return { ok: true };
}

function saveProject(input, who) {
  if (!input.id || !input.name) throw new Error('A project needs a name.');
  var existing = findProject(input.id, true);
  var url = function (u) { return /^https?:\/\//i.test(u || '') ? u : ''; };
  var p = {
    id: input.id,
    name: String(input.name).trim(),
    due: input.due || '',
    link: url(input.link),
    description: input.description || '',
    courseLink: url(input.courseLink),
    status: input.status === 'done' ? 'done' : '',
    calendarEventId: existing ? existing.calendarEventId : ''
  };
  p.calendarEventId = syncProjectCalendar(p);
  writeRow('Projects', p);
  log(who, existing ? 'project edit' : 'project create', p.name);
  return { ok: true, project: p };
}

/** Anyone on the team can mark a project deadline as submitted (or undo it). */
function setProjectStatus(id, status, who) {
  var p = findProject(id);
  p.status = status === 'done' ? 'done' : '';
  p.calendarEventId = syncProjectCalendar(p);
  writeRow('Projects', p);
  log(who, 'project status', p.name + ' -> ' + (p.status || 'open'));
  return { ok: true, project: p };
}

function findProject(id, quiet) {
  var list = readTable('Projects');
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  if (quiet) return null;
  throw new Error('That project no longer exists. Reload the page.');
}

function findAssignment(id, quiet) {
  var list = readTable('Assignments');
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  if (quiet) return null;
  throw new Error('That assignment no longer exists. Reload the page.');
}

function indexBy(list) { var o = {}; list.forEach(function (x) { o[x.id] = x; }); return o; }

/* ------------------------------------------------------------------ calendar */

function calendar() {
  var id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  return id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
}

/** Creates or updates a 30-minute event ending at the due time, with the assignee as a guest. Returns the event id. */
function syncCalendar(a) {
  if (!a.due) { removeEvent(a.calendarEventId); return ''; }
  var member = indexBy(readTable('Members'))[a.memberId] || {};
  var end = new Date(a.due), start = new Date(end.getTime() - 30 * 60000);
  var title = (a.status === 'done' ? 'Done: ' : 'Due: ') + a.title;
  var appUrl = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
  var description = (a.instructions || '') + (a.link ? '\n\nDocument: ' + a.link : '') + (appUrl ? '\n\nMicrobe Busters Hub: ' + appUrl + '#/a/' + a.id : '');
  var cal = calendar(), ev = null;
  if (a.calendarEventId) { try { ev = cal.getEventById(a.calendarEventId); } catch (e) { ev = null; } }
  if (ev) {
    var moved = ev.getEndTime().getTime() !== end.getTime();
    ev.setTitle(title);
    ev.setDescription(description);
    if (moved) ev.setTime(start, end);
    if (member.email && !ev.getGuestByEmail(member.email)) ev.addGuest(member.email);
    return ev.getId();
  }
  ev = cal.createEvent(title, start, end, { description: description, guests: member.email || '', sendInvites: true });
  ev.addPopupReminder(24 * 60);
  ev.addPopupReminder(60);
  return ev.getId();
}

/** Project deadline: a 30-minute event ending at the due time, with the whole team invited. */
function syncProjectCalendar(p) {
  if (!p.due) { removeEvent(p.calendarEventId); return ''; }
  var emails = readTable('Members').map(function (m) { return m.email; }).filter(Boolean);
  var end = new Date(p.due), start = new Date(end.getTime() - 30 * 60000);
  var title = (p.status === 'done' ? 'Submitted: ' : 'Team deadline: ') + p.name;
  var appUrl = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
  var description = (p.description || '') + (p.courseLink ? '\n\nbCourses: ' + p.courseLink : '') +
    (p.link ? '\n\nDocument: ' + p.link : '') + (appUrl ? '\n\nMicrobe Busters Hub: ' + appUrl + '#/p/' + p.id : '');
  var cal = calendar(), ev = null;
  if (p.calendarEventId) { try { ev = cal.getEventById(p.calendarEventId); } catch (e) { ev = null; } }
  if (ev) {
    ev.setTitle(title);
    ev.setDescription(description);
    if (ev.getEndTime().getTime() !== end.getTime()) ev.setTime(start, end);
    emails.forEach(function (em) { if (!ev.getGuestByEmail(em)) ev.addGuest(em); });
    return ev.getId();
  }
  ev = cal.createEvent(title, start, end, { description: description, guests: emails.join(','), sendInvites: true });
  ev.addPopupReminder(24 * 60);
  ev.addPopupReminder(60);
  return ev.getId();
}

function removeEvent(eventId) {
  if (!eventId) return;
  try { var ev = calendar().getEventById(eventId); if (ev) ev.deleteEvent(); } catch (e) { /* already gone */ }
}

/* ------------------------------------------------------------------ meetings */

/**
 * Reads the weekly meeting from Google Calendar (next 4 months and the last 2),
 * keeps the Meetings tab in step, and prepares the doc for any meeting in the
 * next PREP_DAYS days. Runs at 6 AM and 6 PM, and from the hub's project view.
 */
function syncMeetings() {
  var now = new Date();
  var from = new Date(now.getTime() - 60 * 86400000), to = new Date(now.getTime() + 120 * 86400000);
  var events = calendarMeetings(from, to);
  var existing = indexBy(readTable('Meetings'));
  var seen = {};
  events.forEach(function (ev) {
    var id = Utilities.formatDate(ev.start, TZ, 'yyyy-MM-dd');
    var m = existing[id] || { id: id, docUrl: '', agendaSharedAt: '', agendaSharedBy: '' };
    m.start = cell(ev.start); m.end = cell(ev.end); m.title = ev.title;
    m.meetLink = ev.meetLink || m.meetLink || setting('MEET_LINK');
    m.eventId = ev.id;
    writeRow('Meetings', m);
    existing[id] = m; seen[id] = true;
  });
  // A future meeting that disappeared from the calendar was cancelled: drop it unless it already has a doc.
  Object.keys(existing).forEach(function (id) {
    var m = existing[id];
    if (!seen[id] && new Date(m.start) > now && !m.docUrl) { deleteRow('Meetings', id); delete existing[id]; }
  });
  var list = Object.keys(existing).map(function (k) { return existing[k]; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  var horizon = new Date(now.getTime() + Number(setting('PREP_DAYS')) * 86400000);
  list.forEach(function (m, i) {
    var start = new Date(m.start);
    if (!m.docUrl && start > now && start <= horizon) prepareMeeting(m, list[i - 1], list[i + 1]);
  });
  return list;
}

/** Instances of the weekly meeting, with Meet links when the Calendar advanced service is on. */
function calendarMeetings(from, to) {
  var query = setting('MEETING_QUERY');
  try {
    var res = Calendar.Events.list('primary', { q: query, timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 100 });
    return (res.items || []).filter(function (e) { return e.status !== 'cancelled' && e.start && e.start.dateTime && e.summary === query; }).map(function (e) {
      var link = e.hangoutLink || '';
      if (!link && e.conferenceData && e.conferenceData.entryPoints) {
        e.conferenceData.entryPoints.forEach(function (p) { if (p.entryPointType === 'video' && !link) link = p.uri; });
      }
      return { id: e.id, title: e.summary, start: new Date(e.start.dateTime), end: new Date(e.end.dateTime), meetLink: link };
    });
  } catch (err) {
    // Advanced service off: fall back to CalendarApp (no Meet link; MEET_LINK is used instead).
    return CalendarApp.getDefaultCalendar().getEvents(from, to, { search: query }).filter(function (e) { return e.getTitle() === query; }).map(function (e) {
      return { id: e.getId(), title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime(), meetLink: '' };
    });
  }
}

function when(start, end) {
  var t = function (d) { return Utilities.formatDate(d, TZ, Utilities.formatDate(d, TZ, 'mm') === '00' ? 'h a' : 'h:mm a'); };
  return Utilities.formatDate(start, TZ, 'EEE, MMM d, yyyy') + ', ' + t(start) + ' to ' + t(end) + ' Pacific';
}
function atTime(day, hhmm) {
  // "yyyy-MM-ddTHH:mm:00±hh:mm" in the team's time zone for the calendar day of `day`.
  var noon = new Date(Utilities.formatDate(day, TZ, "yyyy-MM-dd'T'12:00:00XXX"));
  return Utilities.formatDate(noon, TZ, 'yyyy-MM-dd') + 'T' + hhmm + ':00' + Utilities.formatDate(noon, TZ, 'XXX');
}

/** Copies the master doc for one meeting, fills in the dates and links, and assigns the agenda and notes. */
function prepareMeeting(m, prev, next) {
  var start = new Date(m.start), end = new Date(m.end);
  var folder = DriveApp.getFolderById(setting('MEETINGS_FOLDER_ID'));
  var file = DriveApp.getFileById(setting('MEETING_MASTER_ID')).makeCopy(m.id + ' ' + docBaseName(prev), folder);
  var doc = DocumentApp.openById(file.getId()), body = doc.getBody();
  var agendaDue = new Date(atTime(new Date(start.getTime() - 86400000), '21:00'));
  var prevLabel = prev && prev.docUrl ? Utilities.formatDate(new Date(prev.start), TZ, 'MMM d') + ' meeting notes' : 'none yet';
  var values = {
    DATE: m.id,
    WHEN: when(start, end),
    MEET: m.meetLink || setting('MEET_LINK'),
    AGENDA_DUE: Utilities.formatDate(agendaDue, TZ, "EEE, MMM d 'at' h a"),
    NEXT_WHEN: next ? when(new Date(next.start), new Date(next.end)) : 'Not scheduled yet',
    PREV_LINK: prevLabel
  };
  Object.keys(values).forEach(function (k) { body.replaceText('\\{\\{' + k + '\\}\\}', values[k]); });
  linkText(body, values.MEET, values.MEET);
  if (prev && prev.docUrl) linkText(body, prevLabel, prev.docUrl);
  doc.saveAndClose();
  m.docUrl = file.getUrl();
  writeRow('Meetings', m);

  // The two recurring jobs, as assignments with the doc attached.
  var label = Utilities.formatDate(start, TZ, 'MMM d');
  var jobs = [
    { id: 'm-' + m.id + '-agenda', memberId: setting('MEETING_LEAD'), title: 'Post the agenda for the ' + label + ' meeting', due: cell(agendaDue), instructions: MEETING_STEPS.agenda },
    { id: 'm-' + m.id + '-notes', memberId: setting('NOTE_TAKER'), title: 'Take notes at the ' + label + ' meeting', due: atTime(new Date(start.getTime() + 86400000), '12:00'), instructions: MEETING_STEPS.notes }
  ];
  jobs.forEach(function (j) {
    if (findAssignment(j.id, true)) return;
    var a = { id: j.id, projectId: 'meetings', memberId: j.memberId, title: j.title, instructions: j.instructions, due: j.due,
      link: m.docUrl, linkLabel: 'Open the meeting doc', status: 'todo', updatedAt: cell(new Date()), updatedBy: 'hub', calendarEventId: '' };
    a.calendarEventId = syncCalendar(a);
    writeRow('Assignments', a);
  });
  log('hub', 'meeting prepared', m.id);
  return m;
}

/** "Microbe Busters Meeting – ..." taken from last meeting's doc name, so the naming stays consistent. */
function docBaseName(prev) {
  if (setting('MEETING_DOC_NAME')) return setting('MEETING_DOC_NAME');
  var id = prev && prev.docUrl && (/\/d\/([\w-]+)/.exec(prev.docUrl) || [])[1];
  if (id) { try { return DriveApp.getFileById(id).getName().replace(/^\d{4}-\d{2}-\d{2}\s*/, ''); } catch (e) { /* no access */ } }
  return 'Microbe Busters Meeting';
}

/** Email addresses of the meeting's calendar guests who aren't on the team (the client). */
function clientEmails(m, members) {
  if (setting('CLIENT_EMAIL')) return setting('CLIENT_EMAIL').split(',');
  var team = members.map(function (x) { return String(x.email).toLowerCase(); });
  try {
    var ev = Calendar.Events.get('primary', m.eventId);
    return (ev.attendees || []).map(function (a) { return a.email; }).filter(function (e) { return e && team.indexOf(e.toLowerCase()) < 0 && !/resource\.calendar\.google\.com$/.test(e); });
  } catch (e) { return []; }
}

function linkText(body, text, url) {
  var pattern = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var found = body.findText(pattern);
  while (found) {
    found.getElement().asText().setLinkUrl(found.getStartOffset(), found.getEndOffsetInclusive(), url);
    found = body.findText(pattern, found);
  }
}

function findMeeting(id) {
  var list = readTable('Meetings');
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  throw new Error('That meeting is no longer on the calendar. Reload the page.');
}

/** Anyone can suggest a topic. It is saved and added under "Suggested by the team" in the meeting doc. */
function addTopic(meetingId, text, who) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Write the topic first.');
  if (text.length > 300) throw new Error('Keep the topic under 300 characters.');
  var m = findMeeting(meetingId);
  var member = indexBy(readTable('Members'))[who] || {};
  var t = { id: 't-' + Utilities.getUuid().slice(0, 8), meetingId: m.id, text: text, memberId: who, createdAt: cell(new Date()) };
  writeRow('Topics', t);
  if (m.docUrl) {
    try { addTopicToDoc(m.docUrl, text + (member.name ? ' (' + member.name.split(' ')[0] + ')' : '')); } catch (e) { log(who, 'topic doc error', e.message); }
  }
  log(who, 'topic', m.id + ': ' + text);
  return { ok: true, topic: t };
}

function addTopicToDoc(docUrl, line) {
  var doc = DocumentApp.openByUrl(docUrl), body = doc.getBody();
  var found = body.findText('Suggested by the team');
  if (!found) { body.appendListItem(line).setGlyphType(DocumentApp.GlyphType.BULLET); doc.saveAndClose(); return; }
  var heading = found.getElement().getParent();
  var i = body.getChildIndex(heading) + 1, last = null;
  while (i < body.getNumChildren() && body.getChild(i).getType() === DocumentApp.ElementType.LIST_ITEM) { last = body.getChild(i).asListItem(); i++; }
  if (last && last.getText().trim() === 'None yet.') last.setText(line);
  else if (last) body.insertListItem(i, last.copy().setText(line));
  else body.insertListItem(i, line).setGlyphType(DocumentApp.GlyphType.BULLET);
  doc.saveAndClose();
}

/** The agenda lines: list items between the "Agenda" heading and "Suggested by the team". */
function agendaLines(docUrl) {
  var body = DocumentApp.openByUrl(docUrl).getBody(), out = [], inAgenda = false;
  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i), type = el.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      var p = el.asParagraph(), h = p.getHeading();
      if (h === DocumentApp.ParagraphHeading.HEADING2 && p.getText().trim() === 'Agenda') { inAgenda = true; continue; }
      if (inAgenda && h !== DocumentApp.ParagraphHeading.NORMAL) break;
    } else if (inAgenda && type === DocumentApp.ElementType.LIST_ITEM) {
      var t = el.asListItem().getText().trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** Mary's button: emails the agenda to the team (and Christopher if asked) and marks her agenda job done. */
function shareAgenda(meetingId, includeClient, who) {
  var m = findMeeting(meetingId);
  if (!m.docUrl) throw new Error('The doc for this meeting is not ready yet.');
  var members = readTable('Members'), byMember = indexBy(members);
  var lines = agendaLines(m.docUrl);
  lines = lines.filter(function (l) { return !/^\[Topic\]/.test(l); });
  var topics = lines.filter(function (l) { return !/^Review last meeting's action items/.test(l) && !/^Wrap-up:/.test(l); });
  if (!topics.length) throw new Error('Add at least one topic to the Agenda section of the meeting doc first.');
  var start = new Date(m.start), end = new Date(m.end);
  var appUrl = setting('APP_URL');
  var to = members.map(function (x) { return x.email; }).filter(Boolean);
  if (includeClient) to = to.concat(clientEmails(m, members));
  var sender = byMember[who] || {};
  var html = '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#000">' +
    '<p>Hi all,</p><p>Here is the agenda for our meeting on <b>' + esc(when(start, end)) + '</b>.</p><ol style="padding-left:22px">' +
    lines.map(function (l) { return '<li style="margin:0 0 6px">' + esc(l) + '</li>'; }).join('') + '</ol>' +
    '<p><a href="' + esc(m.meetLink) + '">Join Google Meet</a> | <a href="' + esc(m.docUrl) + '">Agenda and notes doc</a>' +
    (appUrl ? ' | <a href="' + esc(appUrl + '#/meetings') + '">Suggest a topic in the hub</a>' : '') + '</p>' +
    '<p>' + esc(sender.name ? sender.name.split(' ')[0] : 'The meeting lead') + '</p></div>';
  var subject = 'Agenda: ' + Utilities.formatDate(start, TZ, 'EEE, MMM d') + ' meeting';
  MailApp.sendEmail({ to: to.join(','), subject: subject, htmlBody: html, body: stripHtml(html), name: 'Microbe Busters Hub', replyTo: sender.email || '' });
  m.agendaSharedAt = cell(new Date()); m.agendaSharedBy = who;
  writeRow('Meetings', m);
  var job = findAssignment('m-' + m.id + '-agenda', true);
  if (job && job.status !== 'done') { job.status = 'done'; job.updatedAt = cell(new Date()); job.updatedBy = who; writeRow('Assignments', job); }
  log(who, 'agenda shared', m.id + ' to ' + to.length);
  return { ok: true, meeting: m, sentTo: to.length, assignment: job };
}

/* ------------------------------------------------------------------ Drive */

function listFiles() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('files');
  if (hit) return JSON.parse(hit);
  var id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) return [];
  var out = [];
  var root = DriveApp.getFolderById(id);
  collect(root, '', out, 0);
  out.sort(function (a, b) { return a.modified < b.modified ? 1 : -1; });
  out = out.slice(0, 300);
  try { cache.put('files', JSON.stringify(out), 600); } catch (e) { /* too big to cache */ }
  return out;
}

function collect(folder, path, out, depth) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    out.push({ name: f.getName(), url: f.getUrl(), type: fileType(f.getMimeType()), modified: cell(f.getLastUpdated()), folder: path || 'Top level' });
  }
  if (depth >= 2) return;
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    collect(s, path ? path + ' / ' + s.getName() : s.getName(), out, depth + 1);
  }
}

function fileType(mime) {
  var map = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Form',
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint'
  };
  if (map[mime]) return map[mime];
  if (/^image\//.test(mime)) return 'Image';
  if (/^video\//.test(mime)) return 'Video';
  return 'File';
}

/* ------------------------------------------------------------------ reminders */

/** Runs every morning at 8 AM (set up by setup()). Returns the number of emails sent. */
function sendDailyReminders() {
  var props = PropertiesService.getScriptProperties();
  var appUrl = props.getProperty('APP_URL') || '';
  var members = readTable('Members'), assignments = readTable('Assignments');
  var projectList = readTable('Projects'), projects = indexBy(projectList);
  var now = new Date(), soon = new Date(now.getTime() + 48 * 3600000), week = new Date(now.getTime() + 7 * 86400000);
  var sent = 0;
  // Team deadlines (class assignments and the like) that are coming up and not yet submitted.
  var openProjects = projectList.filter(function (p) { return p.status !== 'done' && p.due; });
  var teamSoon = openProjects.filter(function (p) { var d = new Date(p.due); return d >= now && d <= soon; });
  var teamItems = teamSoon.map(function (p) {
    return '<li style="margin:0 0 14px"><b>' + esc(p.name) + '</b><br>Team deadline: ' + esc(fmt(new Date(p.due))) + '<br>' +
      (appUrl ? '<a href="' + esc(appUrl + '#/p/' + p.id) + '">Open the details</a>' : '') +
      (p.courseLink ? (appUrl ? ' | ' : '') + '<a href="' + esc(p.courseLink) + '">Open on bCourses</a>' : '') + '</li>';
  }).join('');

  members.forEach(function (m) {
    if (!m.email) return;
    var mine = assignments.filter(function (a) { return a.memberId === m.id && a.status !== 'done' && a.due && new Date(a.due) <= soon; })
      .sort(function (a, b) { return new Date(a.due) - new Date(b.due); });
    if (!mine.length && !teamSoon.length) return;
    var late = mine.filter(function (a) { return new Date(a.due) < now; }).length;
    var subject = mine.length
      ? 'Microbe Busters: ' + (late ? late + ' overdue, ' : '') + (mine.length - late) + ' due in the next 2 days'
      : 'Microbe Busters: team deadline ' + (teamSoon.length === 1 ? 'coming up' : 'coming up (' + teamSoon.length + ')');
    var items = mine.map(function (a) {
      var d = new Date(a.due), isLate = d < now;
      return '<li style="margin:0 0 14px"><b>' + esc(a.title) + '</b><br>' + (isLate ? '<b>Overdue.</b> Was due ' : 'Due ') + esc(fmt(d)) +
        (projects[a.projectId] ? ', ' + esc(projects[a.projectId].name) : '') + '<br>' +
        (appUrl ? '<a href="' + esc(appUrl + '#/a/' + a.id) + '">Open the instructions</a>' : '') +
        (a.link ? (appUrl ? ' | ' : '') + '<a href="' + esc(a.link) + '">' + esc(a.linkLabel || 'Open the document') + '</a>' : '') + '</li>';
    }).join('');
    var html = '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#000">' +
      '<p>Hi ' + esc(m.name.split(' ')[0]) + ',</p>' +
      (mine.length ? '<p>Here is what you have coming up:</p><ul style="padding-left:20px">' + items + '</ul>' : '') +
      (teamSoon.length ? '<p>Whole-team deadline' + (teamSoon.length > 1 ? 's' : '') + ':</p><ul style="padding-left:20px">' + teamItems + '</ul>' : '') +
      '<p>When you finish something, mark it done in the hub so the team can see it.' + (appUrl ? ' <a href="' + esc(appUrl + '#/m/' + m.id) + '">Your assignments</a>' : '') + '</p></div>';
    MailApp.sendEmail({ to: m.email, subject: subject, htmlBody: html, body: stripHtml(html), name: 'Microbe Busters Hub' });
    sent++;
  });

  // Project manager summary
  var pmEmail = props.getProperty('PM_EMAIL');
  if (pmEmail) {
    var byMember = indexBy(members);
    var open = assignments.filter(function (a) { return a.status !== 'done'; });
    var late = open.filter(function (a) { return a.due && new Date(a.due) < now; });
    var upcoming = open.filter(function (a) { return a.due && new Date(a.due) >= now && new Date(a.due) <= week; });
    var dayAgo = new Date(now.getTime() - 86400000);
    var doneRecent = assignments.filter(function (a) { return a.status === 'done' && a.updatedAt && new Date(a.updatedAt) >= dayAgo; });
    var teamWeek = openProjects.filter(function (p) { var d = new Date(p.due); return d <= week; })
      .sort(function (a, b) { return new Date(a.due) - new Date(b.due); });
    if (late.length || upcoming.length || doneRecent.length || teamWeek.length) {
      var list = function (arr) {
        return arr.length ? '<ul style="padding-left:20px">' + arr.sort(function (a, b) { return new Date(a.due) - new Date(b.due); }).map(function (a) {
          return '<li>' + esc((byMember[a.memberId] || {}).name || a.memberId) + ': ' + esc(a.title) + (a.due ? ' (' + esc(fmt(new Date(a.due))) + ')' : '') + '</li>';
        }).join('') + '</ul>' : '<p>None.</p>';
      };
      var teamHtml = teamWeek.length ? '<ul style="padding-left:20px">' + teamWeek.map(function (p) {
        var d = new Date(p.due);
        return '<li>' + esc(p.name) + ' (' + esc(fmt(d)) + (d < now ? ', past due and not marked submitted' : '') + ')</li>';
      }).join('') + '</ul>' : '<p>None.</p>';
      var pmHtml = '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#000">' +
        '<h3 style="margin:16px 0 4px">Team deadlines in the next 7 days (' + teamWeek.length + ')</h3>' + teamHtml +
        '<h3 style="margin:16px 0 4px">Overdue (' + late.length + ')</h3>' + list(late) +
        '<h3 style="margin:16px 0 4px">Due in the next 7 days (' + upcoming.length + ')</h3>' + list(upcoming) +
        '<h3 style="margin:16px 0 4px">Finished in the last day (' + doneRecent.length + ')</h3>' + list(doneRecent) +
        (appUrl ? '<p><a href="' + esc(appUrl + '#/pm') + '">Open the project view</a></p>' : '') + '</div>';
      MailApp.sendEmail({ to: pmEmail, subject: 'Microbe Busters team summary: ' + late.length + ' overdue, ' + upcoming.length + ' due in 7 days', htmlBody: pmHtml, body: stripHtml(pmHtml), name: 'Microbe Busters Hub' });
      sent++;
    }
  }
  return sent;
}

function fmt(d) { return Utilities.formatDate(d, TZ, 'EEE, MMM d, h:mm a'); }
function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function stripHtml(h) { return h.replace(/<\/[uo]l>/g, '\n\n').replace(/<li[^>]*>/g, '\n- ').replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
