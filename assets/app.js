/* Microbe Busters Hub: team assignments, project view and Drive files.
   Data comes from a Google Apps Script web app (see apps-script/Code.gs),
   or from data/demo.json when no apiUrl is set in assets/config.js. */
(function () {
  "use strict";

  var cfg = window.MB_CONFIG || {};
  var TZ = cfg.timeZone || "America/Los_Angeles";
  var DAY = 86400000;
  var main = document.getElementById("main");
  var state = { data: null, demo: !cfg.apiUrl, error: "" };

  /* ---------- small helpers ---------- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem("mb." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("mb." + k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { window.localStorage.removeItem("mb." + k); } catch (e) { /* ignore */ } }
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; } return null; }
  function member(id) { return byId(state.data.members, id) || { id: id, name: id || "Unassigned", color: "#6b6b6b", textColor: "#fff", role: "" }; }
  function project(id) { return byId(state.data.projects, id) || { id: id, name: "No project" }; }
  function first(name) { return String(name || "").split(" ")[0]; }
  function initial(name) { return esc(String(name || "?").charAt(0).toUpperCase()); }
  function newId(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 9); }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, 3200);
  }

  /* ---------- dates (always shown in the team's time zone) ---------- */
  function parts(date) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    var o = {}; f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function dayNumber(date) { var p = parts(date); return Date.UTC(+p.year, +p.month - 1, +p.day) / DAY; }
  function fmtDay(date, withYear) {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: withYear ? "numeric" : undefined }).format(date);
  }
  function fmtTime(date) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(date); }
  function due(a) { return a && a.due ? new Date(a.due) : null; }
  function relDue(d, done) {
    if (!d) return "No due date";
    var now = new Date(), diff = dayNumber(d) - dayNumber(now);
    if (done) return "Done";
    if (d < now) {
      var hours = Math.round((now - d) / 3600000);
      if (hours < 24) return hours <= 1 ? "Overdue by 1 hour" : "Overdue by " + hours + " hours";
      var days = Math.max(1, -diff);
      return "Overdue by " + days + (days === 1 ? " day" : " days");
    }
    if (diff === 0) return parts(d).hour >= "18" ? "Due tonight" : "Due today";
    if (diff === 1) return "Due tomorrow";
    if (diff < 7) return "Due in " + diff + " days";
    return "Due in " + Math.round(diff / 7) + (Math.round(diff / 7) === 1 ? " week" : " weeks");
  }
  function tzOffsetMin(ts) {
    var p = parts(new Date(ts));
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.round((asUTC - Math.floor(ts / 60000) * 60000) / 60000);
  }
  function zonedIso(dateStr, timeStr) {
    if (!dateStr) return "";
    var d = dateStr.split("-"), t = (timeStr || "23:59").split(":");
    var guess = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]);
    var off = tzOffsetMin(guess);
    off = tzOffsetMin(guess - off * 60000);
    var sign = off < 0 ? "-" : "+", abs = Math.abs(off);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return dateStr + "T" + pad(+t[0]) + ":" + pad(+t[1]) + ":00" + sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }
  function localParts(iso) {
    if (!iso) return { date: "", time: "23:59" };
    var p = parts(new Date(iso));
    return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
  }

  /* ---------- status: always a shape plus a word ---------- */
  var LABEL = { todo: "To do", doing: "In progress", done: "Done", late: "Overdue", soon: "Due soon" };
  function statusKey(a) {
    if (a.status === "done") return "done";
    var d = due(a);
    if (d && d < new Date()) return "late";
    return a.status === "doing" ? "doing" : "todo";
  }
  function shape(key) {
    var s = '<svg class="st__shape" viewBox="0 0 18 18" aria-hidden="true" focusable="false">';
    if (key === "done") s += '<circle cx="9" cy="9" r="8.5" fill="var(--st-done)"/><path d="M5 9.4l2.6 2.6L13 6.6" fill="none" stroke="var(--paper)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (key === "late") s += '<path d="M9 1.2L17.2 16.4H0.8Z" fill="var(--st-late)"/><path d="M9 6.5v4.6" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round"/><circle cx="9" cy="13.6" r="1.2" fill="var(--paper)"/>';
    else if (key === "doing") s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-doing)" stroke-width="2.5"/><path d="M9 1.5a7.5 7.5 0 0 1 0 15z" fill="var(--st-doing)"/>';
    else if (key === "soon") s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-soon)" stroke-width="2.5"/><path d="M9 4.5V9l3.2 2" fill="none" stroke="var(--st-soon)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    else s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-todo)" stroke-width="2.5"/>';
    return s + "</svg>";
  }
  function pKey(p) {
    if (p.status === "done") return "done";
    var d = due(p);
    return d && d < new Date() ? "late" : "todo";
  }
  var PLABEL = { done: "Submitted", late: "Past due", todo: "Open" };
  var CLIENT = cfg.clientName || "our client";
  function isClient(p) { return p && p.audience === "client"; }
  function doneWord(p) { return isClient(p) ? "Delivered" : "Submitted"; }
  function pBadge(p) {
    var k = pKey(p);
    if (k !== "done" && (p.scope === "to-confirm" || p.scope === "on-hold")) return '<span class="st">' + shape("todo") + (p.scope === "on-hold" ? "On hold" : "Not confirmed") + "</span>";
    return '<span class="st">' + shape(k) + (k === "done" ? doneWord(p) : PLABEL[k]) + "</span>";
  }
  function pRel(p) { var d = due(p); if (p.status === "done") return doneWord(p); if (!d) return ""; return relDue(d, false).replace("Overdue by", "Past due by"); }
  /* Who a deadline is for: filled tag for the client, outlined tag for the class. Text carries the meaning; fill tells them apart at a glance. */
  function forTag(p, small) {
    if (!p || !p.audience) return "";
    return '<span class="for for--' + esc(p.audience) + (small ? " for--sm" : "") + '">' + (p.audience === "client" ? "For " + esc(CLIENT) : "DevEng C200") + "</span>";
  }
  function badge(a) { var k = statusKey(a); return '<span class="st">' + shape(k) + LABEL[k] + "</span>"; }
  function bullet(m, size) {
    return '<span class="bullet' + (size ? " bullet--" + size : "") + '" style="--c:' + esc(m.color) + ";--t:" + esc(m.textColor || "#fff") + '" aria-hidden="true">' + initial(m.name) + "</span>";
  }

  /* ---------- Google product icons on links (Google's own hosted icons; hidden if they fail to load) ---------- */
  var GICON_BASE = "https://ssl.gstatic.com/images/branding/product/1x/";
  var GICONS = { doc: "docs_2020q4_48dp.png", sheet: "sheets_2020q4_48dp.png", slides: "slides_2020q4_48dp.png", form: "forms_2020q4_48dp.png",
    drive: "drive_2020q4_48dp.png", meet: "meet_2020q4_48dp.png", calendar: "calendar_2020q4_48dp.png" };
  function gKind(url) {
    url = String(url || "");
    if (/docs\.google\.com\/document/.test(url)) return "doc";
    if (/docs\.google\.com\/spreadsheets/.test(url)) return "sheet";
    if (/docs\.google\.com\/presentation/.test(url)) return "slides";
    if (/docs\.google\.com\/forms|forms\.gle/.test(url)) return "form";
    if (/drive\.google\.com/.test(url)) return "drive";
    if (/meet\.google\.com/.test(url)) return "meet";
    if (/calendar\.google\.com/.test(url)) return "calendar";
    return "";
  }
  var TYPE_KIND = { "Google Doc": "doc", "Google Sheet": "sheet", "Google Slides": "slides", "Google Form": "form" };
  function gIcon(kind, small) {
    return GICONS[kind] ? '<img class="gicon' + (small ? " gicon--sm" : "") + '" src="' + GICON_BASE + GICONS[kind] + '" alt="" aria-hidden="true" width="20" height="20" onerror="this.remove()">' : "";
  }
  function iconFor(url, small) { return gIcon(gKind(url), small); }

  /* ---------- data ---------- */
  /* Network activity: a thin bar under the header plus a spoken status, whenever the hub talks to the Sheet. */
  var busyCount = 0;
  function busy(on, msg) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    var bar = document.getElementById("busy"), txt = document.getElementById("busy-text");
    document.documentElement.classList.toggle("is-busy", busyCount > 0);
    main.setAttribute("aria-busy", busyCount > 0 ? "true" : "false");
    if (bar) bar.hidden = busyCount === 0;
    if (txt) txt.textContent = busyCount > 0 ? (msg || "Saving") : "";
  }
  function tracked(promise, msg) {
    busy(true, msg);
    return promise.then(function (v) { busy(false); return v; }, function (e) { busy(false); throw e; });
  }
  function skeleton(msg) {
    var card = '<div class="skel skel--card"><span class="skel__dot"></span><span class="skel__lines"><i></i><i></i><i></i></span></div>';
    return '<div class="wrap" aria-hidden="false"><div class="head"><p class="loading-msg" role="status">' + esc(msg || "Getting the latest from the team Sheet") + '</p><div class="skel skel--h1"></div><div class="skel skel--line"></div></div>' +
      '<div class="skel skel--bar"></div><div class="signs">' + card + card + card + card + "</div></div>";
  }

  function apiGet() {
    var url = cfg.apiUrl + (cfg.apiUrl.indexOf("?") > -1 ? "&" : "?") + "action=data&code=" + encodeURIComponent(store.get("code") || "");
    return tracked(fetch(url, { method: "GET", redirect: "follow" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || "The server said no."); e.code = j.code; throw e; }
      return j.data;
    }), "Loading");
  }
  function apiPost(body) {
    if (state.demo) return Promise.resolve({ ok: true, demo: true });
    body.code = store.get("code") || "";
    body.pmCode = store.get("pmCode") || "";
    body.who = store.get("me") || "";
    return tracked(fetch(cfg.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) { var e = new Error(j.error || "The change wasn't saved."); e.code = j.code; throw e; } return j; }), "Saving");
  }
  function load() {
    var p = state.demo
      ? tracked(fetch("data/demo.json").then(function (r) { return r.json(); }), "Loading")
      : apiGet();
    return p.then(function (d) {
      d.members = d.members || []; d.projects = d.projects || []; d.assignments = d.assignments || [];
      d.milestones = d.milestones || []; d.files = d.files || []; d.meetings = d.meetings || []; d.topics = d.topics || []; d.notes = d.notes || [];
      state.data = d; state.error = "";
      showNotice();
    });
  }
  function showNotice() {
    var n = document.getElementById("notice");
    if (state.demo) {
      n.innerHTML = "<p><b>Demo mode.</b> This is sample data, and changes are not saved. Connect the Google Sheet backend to go live (see README).</p>";
      n.hidden = false;
    } else { n.hidden = true; }
    var fs = document.getElementById("foot-status");
    fs.textContent = state.demo ? "Showing demo data." : "Synced with the team Google Sheet at " + fmtTime(new Date()) + ".";
  }

  /* ---------- views ---------- */
  function counts(list) {
    var now = new Date(), week = new Date(now.getTime() + 7 * DAY), soon = new Date(now.getTime() + 2 * DAY), c = { late: 0, soon: 0, week: 0, doing: 0, done: 0, open: 0 };
    list.forEach(function (a) {
      var k = statusKey(a), d = due(a);
      if (k === "done") { c.done++; return; }
      c.open++;
      if (k === "late") c.late++;
      else if (d && d <= week) { c.week++; if (d <= soon) c.soon++; }
      if (a.status === "doing") c.doing++;
    });
    return c;
  }
  function sortByDue(a, b) {
    var da = due(a), db = due(b);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
    return da - db;
  }
  function mine(id) { return state.data.assignments.filter(function (a) { return a.memberId === id; }).sort(sortByDue); }

  /* Semester clock next to work done, so the team can see whether work is keeping pace with time. */
  function progressHtml() {
    var startDay = cfg.semesterStart || "2026-08-26", endDay = cfg.semesterEnd || "2026-12-18";
    var s = new Date(zonedIso(startDay, "00:00")), e = new Date(zonedIso(endDay, "23:59")), now = new Date();
    var pct = Math.max(0, Math.min(100, Math.round(100 * (now - s) / (e - s))));
    var elapsed = dayNumber(now) - dayNumber(s), total = dayNumber(e) - dayNumber(s) + 1;
    var week = Math.max(1, Math.min(Math.ceil(total / 7), Math.floor(elapsed / 7) + 1)), weeks = Math.ceil(total / 7);
    var left = Math.max(0, dayNumber(e) - dayNumber(now));
    var all = state.data.assignments, done = all.filter(function (a) { return a.status === "done"; }).length;
    var wpct = all.length ? Math.round(100 * done / all.length) : 0;
    function meter(id, label, value, meta, cls) {
      return '<div class="meter ' + cls + '"><p class="meter__label" id="' + id + '"><b>' + value + "%</b> " + label + '</p>' +
        '<div class="meter__bar" role="progressbar" aria-labelledby="' + id + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + value + '"><i style="width:' + value + '%"></i></div>' +
        '<p class="meter__meta">' + meta + "</p></div>";
    }
    return '<section class="semester" aria-labelledby="prog-h"><h2 id="prog-h" class="semester__h">Fall 2026 semester</h2><div class="semester__grid">' +
      meter("prog-time", "of the semester has gone by", pct, (now < s ? "Starts " + esc(fmtDay(s)) : now > e ? "The semester is over" : "Week " + week + " of " + weeks + ", " + left + (left === 1 ? " day" : " days") + " left. Ends " + esc(fmtDay(e)) + "."), "meter--time") +
      meter("prog-work", "of the team's assignments are done", wpct, done + " of " + all.length + " done", "meter--work") +
      "</div></section>";
  }

  function viewHome() {
    var me = store.get("me");
    var now = new Date();
    var ms = state.data.milestones.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var nextIdx = -1;
    ms.forEach(function (m, i) { if (nextIdx < 0 && new Date(m.date) >= now) nextIdx = i; });
    var route = ms.length ? '<section class="route" aria-labelledby="route-h"><h2 id="route-h">Project milestones</h2><ol>' + ms.map(function (m, i) {
      var d = new Date(m.date), cls = d < now ? "is-past" : (i === nextIdx ? "is-next" : "");
      var text = '<span class="when">' + esc(m.dateLabel || fmtDay(d)) + '</span><span class="what">' + esc(m.label) + (i === nextIdx ? '<span class="sr"> (next)</span>' : "") + "</span>";
      var target = m.projectId && byId(state.data.projects, m.projectId);
      if (target && target.audience) text += forTag(target, true);
      return '<li class="' + cls + '"><span class="stop" aria-hidden="true"></span>' + (target ? '<a href="#/p/' + esc(m.projectId) + '">' + text + "</a>" : "<span>" + text + "</span>") + "</li>";
    }).join("") + "</ol></section>" : "";

    var signs = state.data.members.map(function (m) {
      var list = mine(m.id), c = counts(list);
      var next = list.filter(function (a) { return a.status !== "done"; })[0];
      var countHtml = "";
      if (c.late) countHtml += '<span class="count">' + shape("late") + "<span><b>" + c.late + "</b> overdue</span></span>";
      countHtml += '<span class="count">' + shape("todo") + "<span><b>" + c.week + "</b> due in 7 days</span></span>";
      countHtml += '<span class="count">' + shape("done") + "<span><b>" + c.done + "</b> done</span></span>";
      var nextHtml = next
        ? '<p class="sign__next">Next up<b>' + esc(next.title) + "</b>" + esc(next.due ? fmtDay(due(next)) + ", " + fmtTime(due(next)) : "No due date") + "</p>"
        : '<p class="sign__next">Nothing open right now.</p>';
      return '<a class="sign' + (me === m.id ? " is-me" : "") + '" href="#/m/' + esc(m.id) + '">' + bullet(m, "lg") +
        '<span><span class="sign__name">' + esc(m.name) + '</span><br><span class="sign__role">' + esc(m.role) + (me === m.id ? " (you)" : "") + "</span>" +
        '<span class="sign__counts">' + countHtml + "</span>" + nextHtml + "</span></a>";
    }).join("");

    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Team assignments</h1><p>Pick your name to see what you need to do and when it is due.</p></div>' +
      nextMeetingStrip() + progressHtml() + route + '<section aria-labelledby="signs-h"><h2 id="signs-h" class="sr">Team members</h2><div class="signs">' + signs + "</div></section></div>";
  }

  function rowHtml(a, showWho, hideProject) {
    var d = due(a), k = statusKey(a), m = member(a.memberId), p = project(a.projectId);
    return '<li class="row' + (k === "done" ? " is-done" : "") + '"><a href="#/a/' + esc(a.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(a.title) + "</span>" +
      '<span class="row__meta">' + badge(a) + (hideProject ? "" : forTag(p, true) + "<span>" + esc(p.name) + "</span>") + (showWho ? "<span>" + esc(m.name) + "</span>" : "") + "</span></span>" +
      '<span class="row__due"><span class="row__day">' + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "No due date") + '</span><span class="row__rel">' + esc(relDue(d, k === "done")) + "</span></span>" +
      "</a></li>";
  }

  function projectRowHtml(p) {
    var d = due(p), k = pKey(p), n = state.data.assignments.filter(function (a) { return a.projectId === p.id; }).length;
    return '<li class="row row--team' + (k === "done" ? " is-done" : "") + '"><a href="#/p/' + esc(p.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(p.name) + "</span>" +
      '<span class="row__meta">' + pBadge(p) + forTag(p, true) + (n ? "<span>" + n + (n === 1 ? " assignment" : " assignments") + "</span>" : "") + "</span></span>" +
      '<span class="row__due"><span class="row__day">' + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "No date yet") + '</span><span class="row__rel">' + esc(pRel(p)) + "</span></span></a></li>";
  }

  var EMAIL_OPTS = [["daily", "Daily", "Only on days something is due soon, overdue or new"], ["weekly", "Mondays only", "One email with the whole week"], ["off", "Off", "No reminder emails"]];
  function emailPrefHtml(m) {
    var cur = m.emailPref || "daily";
    return '<section class="section" id="email" aria-labelledby="email-h"><h2 id="email-h" tabindex="-1">Email reminders</h2>' +
      '<p class="section__note">Reminders come from the hub at 8 AM, at most once a day, and only when there is something to say. Each item in the email links straight to its page here. This setting is for ' + esc(first(m.name)) + " only.</p>" +
      '<fieldset class="picker picker--email"><legend class="sr">How often ' + esc(first(m.name)) + ' gets reminder emails</legend><div class="picker__opts" data-email-for="' + esc(m.id) + '">' +
      EMAIL_OPTS.map(function (o) { return '<label><input type="radio" name="emailPref" value="' + o[0] + '"' + (o[0] === cur ? " checked" : "") + '><span><b>' + o[1] + '</b><small>' + o[2] + "</small></span></label>"; }).join("") +
      "</div></fieldset></section>";
  }
  function setEmailPref(memberId, pref) {
    var m = byId(state.data.members, memberId); if (!m) return;
    var prev = m.emailPref; m.emailPref = pref;
    apiPost({ action: "setEmailPref", memberId: memberId, pref: pref }).then(function (r) {
      var label = EMAIL_OPTS.filter(function (o) { return o[0] === pref; })[0][1];
      toast("Email reminders: " + label + (r.demo ? " (demo, not saved)" : ""));
    }).catch(function (e) { m.emailPref = prev; route(); toast("Not saved: " + e.message); });
  }

  function viewMember(id) {
    var m = byId(state.data.members, id);
    if (!m) return notFound("We couldn't find that team member.");
    store.set("me", id);
    var list = mine(id), now = new Date(), week = new Date(now.getTime() + 7 * DAY);
    var groups = { late: [], week: [], later: [], none: [], done: [] };
    list.forEach(function (a) {
      var k = statusKey(a), d = due(a);
      if (k === "done") groups.done.push(a);
      else if (k === "late") groups.late.push(a);
      else if (!d) groups.none.push(a);
      else if (d <= week) groups.week.push(a);
      else groups.later.push(a);
    });
    function sec(key, title, empty) {
      var items = groups[key];
      if (!items.length && !empty) return "";
      return '<section class="section" aria-labelledby="g-' + key + '"><h2 id="g-' + key + '">' + title + '</h2>' +
        (items.length ? '<ul class="rows">' + items.map(function (a) { return rowHtml(a); }).join("") + "</ul>" : '<p class="empty">' + empty + "</p>") + "</section>";
    }
    var team = state.data.projects.filter(function (p) { return p.due && p.status !== "done" && p.scope !== "to-confirm" && p.scope !== "on-hold"; }).sort(sortByDue);
    var teamHtml = team.length ? '<section class="section" aria-labelledby="g-team"><h2 id="g-team">Team deadlines</h2><p class="section__note">Shared by the whole team. Open one to see what the class or client asks for.</p><ul class="rows">' +
      team.map(projectRowHtml).join("") + "</ul></section>" : "";
    var doneHtml = groups.done.length
      ? '<section class="section"><details class="done-list"><summary>Done (' + groups.done.length + ")</summary><ul class=\"rows\">" + groups.done.map(function (a) { return rowHtml(a); }).join("") + "</ul></details></section>"
      : "";
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/">Team</a>' +
      '<div class="detail__who">' + bullet(m, "lg") + '<div><h1 tabindex="-1">' + esc(m.name) + "</h1><p>" + esc(m.role) + "</p></div></div></div>" +
      sec("late", "Overdue") + sec("week", "Due in the next 7 days", "Nothing due in the next 7 days.") + sec("later", "Later") + sec("none", "No due date") + teamHtml + doneHtml + emailPrefHtml(m) + "</div>";
  }

  /* Plain text from the Sheet to safe HTML. Supports [label](https://...) links,
     bare https:// links, "- " bullet lines, "1. " numbered lines and "### " subheadings. */
  var LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;
  function shortUrl(u) {
    var t = u.replace(/^https?:\/\/(www\.)?/i, "");
    return t.length > 44 ? t.slice(0, 42) + "…" : t;
  }
  function inline(text) {
    var out = "", last = 0, m;
    text = String(text || "");
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
      out += esc(text.slice(last, m.index));
      var url = m[2] || m[3], label = m[1] || shortUrl(url);
      out += '<a class="ilink" href="' + esc(url) + '" target="_blank" rel="noopener">' + iconFor(url, true) + esc(label) + '<span class="sr"> (opens in a new tab)</span></a>';
      last = LINK_RE.lastIndex;
    }
    return out + esc(text.slice(last));
  }
  function richText(text, emptyMsg) {
    var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return emptyMsg ? '<p class="empty">' + esc(emptyMsg) + "</p>" : "";
    var BUL = /^[-*•]\s+/, NUM = /^\d+[.)]\s+/;
    // A text that is nothing but steps reads best as one numbered list.
    if (lines.length > 1 && lines.every(function (l) { return BUL.test(l) || NUM.test(l); })) {
      return '<ol class="steps">' + lines.map(function (l) { return "<li>" + inline(l.replace(BUL, "").replace(NUM, "")) + "</li>"; }).join("") + "</ol>";
    }
    var html = "", open = "";
    lines.forEach(function (l) {
      var kind = BUL.test(l) ? "ul" : NUM.test(l) ? "ol" : "";
      if (open && kind !== open) { html += "</" + open + ">"; open = ""; }
      if (kind && !open) { html += "<" + kind + ' class="list">'; open = kind; }
      if (kind) html += "<li>" + inline(l.replace(BUL, "").replace(NUM, "")) + "</li>";
      else if (/^#{2,3}\s+/.test(l)) html += '<h3 class="rt-h">' + inline(l.replace(/^#+\s+/, "")) + "</h3>";
      else html += '<p class="rt-p">' + inline(l) + "</p>";
    });
    return html + (open ? "</" + open + ">" : "");
  }
  function instructionsHtml(text) { return richText(text, "No instructions yet."); }
  function plain(text) { return String(text || "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)"); }
  function calendarUrl(a) {
    var d = due(a); if (!d) return "";
    var f = function (x) { return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var start = new Date(d.getTime() - 30 * 60000);
    var hub = location.href.split("#")[0] + (a.memberId ? "#/a/" : "#/p/") + a.id;
    var details = plain(a.instructions || a.description) + (a.courseLink ? "\n\nbCourses: " + a.courseLink : "") + (a.link ? "\n\n" + a.link : "") + "\n\nMicrobe Busters Hub: " + hub;
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent((a.memberId ? "Due: " + a.title : "Team deadline: " + a.name)) +
      "&dates=" + f(start) + "/" + f(d) + "&details=" + encodeURIComponent(details);
  }

  function meetFor(a) { var x = /^m-(\d{4}-\d{2}-\d{2})-/.exec(a.id || ""); return x ? meetingById(x[1]) : null; }
  function viewAssignment(id) {
    var a = byId(state.data.assignments, id);
    if (!a) return notFound("This assignment was removed or the link is wrong.");
    var m = member(a.memberId), p = project(a.projectId), d = due(a), k = statusKey(a);
    var others = state.data.assignments.filter(function (x) { return x.projectId === a.projectId && x.id !== a.id; }).sort(sortByDue);
    var link = safeUrl(a.link);
    var opts = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(function (o) {
      return '<label>' + '<input type="radio" name="status" value="' + o[0] + '"' + (a.status === o[0] || (!a.status && o[0] === "todo") ? " checked" : "") + '><span>' + o[1] + "</span></label>";
    }).join("");
    var updated = a.updatedAt ? '<p class="section__note">Last changed ' + esc(fmtDay(new Date(a.updatedAt))) + ", " + esc(fmtTime(new Date(a.updatedAt))) + (a.updatedBy ? " by " + esc(member(a.updatedBy).name) : "") + ".</p>" : "";
    var projLink = safeUrl(p.link) && safeUrl(p.link) !== link ? ' <a href="' + esc(p.link) + '" target="_blank" rel="noopener">Project doc</a>' : "";
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0"><a class="crumb" href="#/m/' + esc(m.id) + '">' + esc(first(m.name)) + "'s assignments</a>" +
      '<div class="detail__who">' + bullet(m) + "<span>" + esc(m.name) + "</span></div>" +
      '<h1 tabindex="-1">' + esc(a.title) + '</h1><p class="detail__project">' + (byId(state.data.projects, a.projectId) ? '<a href="#/p/' + esc(p.id) + '">' + esc(p.name) + "</a>" : esc(p.name)) + projLink + "</p></div>" +
      '<div class="due-block"><div class="due-block__when"><p class="due-block__label">Due</p><p class="due-block__date">' + (d ? esc(fmtDay(d)) + "<br>" + esc(fmtTime(d)) : "No due date") + '</p><p class="due-block__rel">' + esc(relDue(d, k === "done")) + '</p></div><div class="due-block__status">' + badge(a) + "</div></div>" +
      "<h2>What to do</h2>" + instructionsHtml(a.instructions) +
      '<div class="actions">' + (link ? '<a class="btn btn--solid" href="' + esc(link) + '" target="_blank" rel="noopener">' + iconFor(link) + esc(a.linkLabel || "Open the document") + '<span class="sr"> (opens in a new tab)</span></a>' : "") +
      (meetFor(a) ? '<a class="btn" href="#/mt/' + esc(meetFor(a).id) + '">Go to the meeting page</a>' : "") +
      (d ? '<a class="btn" href="' + esc(calendarUrl(a)) + '" target="_blank" rel="noopener">' + gIcon("calendar") + 'Add to Google Calendar<span class="sr"> (opens in a new tab)</span></a>' : "") + "</div>" +
      '<fieldset class="picker"><legend>Your progress</legend><div class="picker__opts" data-status-for="' + esc(a.id) + '">' + opts + "</div></fieldset>" + updated +
      (others.length ? "<h2>Others on this project</h2><ul class=\"teammates\">" + others.map(function (o) {
        var om = member(o.memberId);
        return "<li>" + bullet(om, "sm") + '<a href="#/a/' + esc(o.id) + '">' + esc(first(om.name)) + ": " + esc(o.title) + "</a>" + badge(o) + "</li>";
      }).join("") + "</ul>" : "") +
      "</div></div>";
  }

  function viewProject(id) {
    var p = byId(state.data.projects, id);
    if (!p) return notFound("This project was removed or the link is wrong.");
    var d = due(p), k = pKey(p);
    var list = state.data.assignments.filter(function (a) { return a.projectId === p.id; }).sort(sortByDue);
    var course = safeUrl(p.courseLink), doc = safeUrl(p.link);
    var who = list.length ? '<ul class="rows">' + list.map(function (a) { return rowHtml(a, true, true); }).join("") + "</ul>"
      : '<p class="empty">No one has an assignment for this yet. The project manager can split it up with Add an assignment.</p>';
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0">' + (p.audience ? '<a class="crumb" href="#/deliverables">Deliverables</a>' : '<a class="crumb" href="#/">Team</a>') +
      '<h1 tabindex="-1">' + esc(p.name) + '</h1><p class="detail__project">' + (p.audience ? forTag(p) + " " : "") + (isClient(p) ? "Deliverable for " + esc(CLIENT) + (p.scope === "to-confirm" ? ", not confirmed yet" : p.scope === "on-hold" ? ", on hold" : "") : p.audience === "class" ? "Class assignment for the whole team" : "Whole-team deadline") + "</p></div>" +
      '<div class="due-block"><div class="due-block__when"><p class="due-block__label">Due</p><p class="due-block__date">' + (d ? esc(fmtDay(d)) + "<br>" + esc(fmtTime(d)) : "No due date") + '</p><p class="due-block__rel">' + esc(pRel(p)) + '</p></div><div class="due-block__status">' + pBadge(p) + "</div></div>" +
      "<h2>About this</h2>" + richText(p.description, "No description yet.") +
      '<div class="actions">' +
      (course ? '<a class="btn btn--solid" href="' + esc(course) + '" target="_blank" rel="noopener">Open on bCourses<span class="sr"> (opens in a new tab)</span></a>' : "") +
      (doc ? '<a class="btn' + (course ? "" : " btn--solid") + '" href="' + esc(doc) + '" target="_blank" rel="noopener">' + iconFor(doc) + (gKind(doc) === "slides" ? "Open the slides" : gKind(doc) === "sheet" ? "Open the sheet" : "Open the project doc") + '<span class="sr"> (opens in a new tab)</span></a>' : "") +
      (d ? '<a class="btn" href="' + esc(calendarUrl(p)) + '" target="_blank" rel="noopener">' + gIcon("calendar") + 'Add to Google Calendar<span class="sr"> (opens in a new tab)</span></a>' : "") + "</div>" +
      (d || isClient(p) ? '<div class="submit-bar"><p>' + (k === "done" ? "Marked " + doneWord(p).toLowerCase() + ". If that was a mistake, undo it." : isClient(p) ? "Once " + esc(CLIENT) + " has it, mark it delivered so it drops off everyone's list." : "Once the team has turned this in, mark it submitted so it drops off everyone's list.") + '</p><button type="button" class="btn" data-act="project-status" data-id="' + esc(p.id) + '">' + (k === "done" ? "Undo " + doneWord(p).toLowerCase() : "Mark as " + doneWord(p).toLowerCase()) + "</button></div>" : "") +
      "<h2>Who is doing what</h2>" + who +
      '<div class="actions"><button type="button" class="btn" data-act="new-assignment" data-project="' + esc(p.id) + '">Add an assignment</button><button type="button" class="btn btn--quiet" data-act="edit-project" data-id="' + esc(p.id) + '">Edit project</button></div>' +
      "</div></div>";
  }

  function viewDeliverables() {
    var ps = state.data.projects;
    var byDate = function (a, b) { var da = due(a), db = due(b); if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db; };
    var client = ps.filter(isClient).sort(byDate), cls = ps.filter(function (p) { return p.audience === "class"; }).sort(byDate);
    function group(title, note, list, empty) {
      return '<section class="deliv-group"><h3>' + title + "</h3>" + (note ? '<p class="section__note">' + note + "</p>" : "") +
        (list.length ? '<ul class="rows">' + list.map(projectRowHtml).join("") + "</ul>" : '<p class="empty">' + empty + "</p>") + "</section>";
    }
    var agreed = client.filter(function (p) { return !p.scope || p.scope === "confirmed"; });
    var tbc = client.filter(function (p) { return p.scope === "to-confirm"; });
    var hold = client.filter(function (p) { return p.scope === "on-hold"; });
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Deliverables</h1><p>What we owe ' + esc(CLIENT) + ", kept apart from what we owe the class. Everywhere in the hub, work for " + esc(CLIENT) + " carries a " + forTag({ audience: "client" }, true) + " tag and class work carries a " + forTag({ audience: "class" }, true) + " tag.</p></div>" +
      '<section class="section deliv deliv--client" aria-labelledby="dc-h"><h2 id="dc-h">For ' + esc(CLIENT) + "</h2>" +
      group("Agreed", "", agreed, "Nothing agreed yet.") +
      group("Not confirmed yet", "From " + esc(CLIENT) + "'s project pitch and our emails. Ask him which of these he wants from us before we plan work for them.", tbc, "Nothing waiting on an answer.") +
      (hold.length ? group("On hold", "", hold, "") : "") +
      '<div class="actions"><button type="button" class="btn" data-act="new-deliverable">Add a deliverable</button></div></section>' +
      '<section class="section deliv deliv--class" aria-labelledby="dk-h"><h2 id="dk-h">For DevEng C200</h2><p class="section__note">Class assignments, all on bCourses.</p>' +
      (cls.length ? '<ul class="rows">' + cls.map(projectRowHtml).join("") + "</ul>" : '<p class="empty">No class assignments yet.</p>') + "</section></div>";
  }

  function viewPM() {
    var f = { who: store.get("f.who") || "", proj: store.get("f.proj") || "", st: store.get("f.st") || "" };
    var all = state.data.assignments, c = counts(all);
    var list = all.filter(function (a) {
      return (!f.who || a.memberId === f.who) && (!f.proj || a.projectId === f.proj) && (!f.st || statusKey(a) === f.st);
    }).sort(sortByDue);
    function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }
    var toolbar = '<form class="toolbar" id="pm-filter" aria-label="Filter assignments">' +
      '<div class="field"><label for="f-who">Person</label><select id="f-who" name="who">' + opt("", "Everyone", f.who) + state.data.members.map(function (m) { return opt(m.id, m.name, f.who); }).join("") + "</select></div>" +
      '<div class="field"><label for="f-proj">Project</label><select id="f-proj" name="proj">' + opt("", "All projects", f.proj) + state.data.projects.map(function (p) { return opt(p.id, p.name, f.proj); }).join("") + "</select></div>" +
      '<div class="field"><label for="f-st">Status</label><select id="f-st" name="st">' + opt("", "Any status", f.st) + ["late", "todo", "doing", "done"].map(function (k) { return opt(k, LABEL[k], f.st); }).join("") + "</select></div>" +
      '<button type="button" class="btn btn--solid" data-act="new-assignment">New assignment</button></form>';

    var tables = state.data.projects.map(function (p) {
      var rows = list.filter(function (a) { return a.projectId === p.id; });
      if (!rows.length) return "";
      var allP = all.filter(function (a) { return a.projectId === p.id; }), doneP = allP.filter(function (a) { return a.status === "done"; }).length;
      var pct = allP.length ? Math.round(100 * doneP / allP.length) : 0;
      return '<table class="pm-table"><caption><a href="#/p/' + esc(p.id) + '">' + esc(p.name) + "</a> " + forTag(p, true) + (p.due ? "<small>Due " + esc(fmtDay(new Date(p.due))) + "</small>" : "") +
        '<br><span class="progress"><span class="progress__bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span><small>' + doneP + " of " + allP.length + " done</small></span></caption>" +
        '<thead><tr><th scope="col">Who</th><th scope="col">Assignment</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>' +
        rows.map(function (a) {
          var m = member(a.memberId), d = due(a);
          return '<tr><td class="who">' + bullet(m, "sm") + ' <span class="sr">' + esc(m.name) + '</span></td><td class="t"><a href="#/a/' + esc(a.id) + '">' + esc(a.title) + "</a><br><small>" + esc(m.name) + "</small></td>" +
            "<td>" + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "None") + "<br><small>" + esc(relDue(d, a.status === "done")) + "</small></td><td>" + badge(a) + "</td>" +
            '<td class="act"><button type="button" class="btn btn--quiet" data-act="edit-assignment" data-id="' + esc(a.id) + '">Edit<span class="sr"> ' + esc(a.title) + "</span></button></td></tr>";
        }).join("") + "</tbody></table>";
    }).join("");

    var projects = '<section class="section" aria-labelledby="proj-h"><h2 id="proj-h">Projects and team deadlines</h2><p class="section__note">Open a project to edit it, add assignments to it, or mark it submitted.</p><ul class="rows">' + state.data.projects.slice().sort(sortByDue).map(function (p) {
      return projectRowHtml(p);
    }).join("") + '</ul><div class="actions"><button type="button" class="btn" data-act="new-project">New project</button></div></section>';

    var reminders = '<section class="section" aria-labelledby="rem-h"><h2 id="rem-h">Reminders and calendar</h2>' +
      "<p style=\"margin-top:12px;max-width:var(--read)\">Every morning at 8 AM, the hub emails each person only if something of theirs is due in the next 2 days, overdue, or newly assigned, with a link to each item. People choose Daily, Mondays only or Off on their own page. You also get a summary of the whole team. Every deadline is on the shared Microbe Busters deadlines calendar, not on anyone's personal calendar. Meetings refresh from Google Calendar at 6 AM and 6 PM, and each meeting's doc is made a week ahead.</p>" +
      '<div class="actions"><button type="button" class="btn" data-act="send-reminders"' + (state.demo ? " disabled" : "") + ">Send reminders now</button>" +
      '<button type="button" class="btn" data-act="sync-meetings"' + (state.demo ? " disabled" : "") + ">Refresh meetings from Google Calendar</button>" +
      (store.get("pmCode") ? '<button type="button" class="btn btn--quiet" data-act="forget-pm">Forget the project manager code on this device</button>' : "") + "</div></section>";

    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Project view</h1><p>Everything the team owes, by project. Anyone can look. Adding or changing assignments needs the project manager code.</p></div>' +
      '<div class="stats stats--5">' +
      '<div class="stat"><b>' + c.soon + '</b><span>' + shape("soon") + "Due soon</span></div>" +
      '<div class="stat"><b>' + c.late + '</b><span>' + shape("late") + "Overdue</span></div>" +
      '<div class="stat"><b>' + c.week + '</b><span>' + shape("todo") + "Due in 7 days</span></div>" +
      '<div class="stat"><b>' + c.doing + '</b><span>' + shape("doing") + "In progress</span></div>" +
      '<div class="stat"><b>' + c.done + " of " + all.length + '</b><span>' + shape("done") + "Done</span></div></div>" +
      toolbar + (tables || '<p class="empty">No assignments match these filters.</p>') + projects + reminders + "</div>";
  }

  function viewFiles() {
    var files = state.data.files || [];
    var folder = safeUrl(cfg.driveFolderUrl);
    var body;
    if (!files.length) {
      body = '<p class="empty">' + (state.demo ? "The file list appears once the Google Sheet backend is connected." : "No files found in the folder.") + "</p>";
    } else {
      var groups = {};
      files.forEach(function (f) { (groups[f.folder || "Top level"] = groups[f.folder || "Top level"] || []).push(f); });
      body = '<div class="field" style="max-width:28rem;margin-bottom:16px"><label for="file-q">Search files</label><input id="file-q" type="search" autocomplete="off"></div>' +
        Object.keys(groups).sort(function (a, b) { return a === "Top level" ? -1 : b === "Top level" ? 1 : a.localeCompare(b); }).map(function (g) {
          return '<section class="section file-group"><h2>' + esc(g) + '</h2><ul class="files">' + groups[g].map(function (fl) {
            return '<li data-name="' + esc(String(fl.name).toLowerCase()) + '"><a href="' + esc(safeUrl(fl.url)) + '" target="_blank" rel="noopener"><span class="files__name">' + gIcon(TYPE_KIND[fl.type] || gKind(fl.url), true) + esc(fl.name) +
              '</span><span class="files__meta">' + esc(fl.type || "") + (fl.modified ? ", edited " + esc(fmtDay(new Date(fl.modified))) : "") + "</span></a></li>";
          }).join("") + "</ul></section>";
        }).join("");
    }
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Team files</h1><p>Everything in the Quito Irrigation Project folder in Google Drive.</p>' +
      (folder ? '<div class="actions"><a class="btn btn--solid" href="' + esc(folder) + '" target="_blank" rel="noopener">' + gIcon("drive") + 'Open the folder in Drive<span class="sr"> (opens in a new tab)</span></a></div>' : "") + "</div>" + body + "</div>";
  }

  /* ---------- meetings ---------- */
  var LEAD = cfg.meetingLead || "mary", NOTES = cfg.noteTaker || "leakey";
  function meetings() { return state.data.meetings.slice().sort(function (a, b) { return new Date(a.start) - new Date(b.start); }); }
  function nextMeeting() { var now = new Date(); return meetings().filter(function (m) { return new Date(m.end || m.start) > now; })[0] || null; }
  function meetingById(id) { return byId(state.data.meetings, id); }
  function meetTime(m) { return fmtTime(new Date(m.start)) + (m.end ? " to " + fmtTime(new Date(m.end)) : ""); }
  function meetRel(m) {
    var s = new Date(m.start), e = new Date(m.end || m.start), now = new Date();
    if (s <= now && now < e) return "Happening now";
    if (e <= now) { var ago = dayNumber(now) - dayNumber(s); return ago === 0 ? "Earlier today" : ago === 1 ? "Yesterday" : ago + " days ago"; }
    var diff = dayNumber(s) - dayNumber(now);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : "In " + diff + " days";
  }
  function agendaDue(m) {
    var s = new Date(m.start), prev = new Date(s.getTime() - DAY), p = parts(prev);
    return new Date(zonedIso(p.year + "-" + p.month + "-" + p.day, "21:00"));
  }
  function agendaState(m) {
    var due = agendaDue(m), now = new Date();
    if (m.agendaSharedAt) {
      var at = new Date(m.agendaSharedAt);
      return { key: "done", text: "Agenda shared " + fmtDay(at) + ", " + fmtTime(at) + (m.agendaSharedBy ? " by " + first(member(m.agendaSharedBy).name) : "") };
    }
    if (new Date(m.start) < now) return { key: "todo", text: "No agenda was shared from the hub" };
    if (!m.docUrl) return { key: "todo", text: "The meeting doc is made automatically a week before" };
    if (now > due) return { key: "late", text: "Agenda not shared yet. It was due " + fmtDay(due) + ", " + fmtTime(due) };
    return { key: "todo", text: "Agenda due " + fmtDay(due) + ", " + fmtTime(due) };
  }
  function agendaBadge(m) { var s = agendaState(m); return '<span class="st">' + shape(s.key) + esc(s.text) + "</span>"; }
  function whoSelect(id, label, preset) {
    var cur = preset || store.get("me") || "";
    return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '" name="who" required>' +
      (cur ? "" : '<option value="">Pick your name</option>') +
      state.data.members.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === cur ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></div>";
  }

  function meetingCard(m, heading) {
    var s = new Date(m.start), link = safeUrl(m.meetLink), doc = safeUrl(m.docUrl), past = new Date(m.end || m.start) < new Date();
    var lead = member(LEAD), notes = member(NOTES);
    return '<section class="meet" aria-labelledby="meet-h"><div class="meet__when">' +
      '<p class="due-block__label" id="meet-h">' + esc(heading) + "</p>" +
      '<p class="meet__date">' + esc(fmtDay(s)) + '</p><p class="meet__time">' + esc(meetTime(m)) + '</p><p class="meet__rel">' + esc(meetRel(m)) + "</p></div>" +
      '<div class="meet__side"><div class="actions" style="margin-top:0">' +
      (link && !past ? '<a class="btn btn--solid" href="' + esc(link) + '" target="_blank" rel="noopener">' + gIcon("meet") + 'Join Google Meet<span class="sr"> (opens in a new tab)</span></a>' : "") +
      (doc ? '<a class="btn' + (link && !past ? "" : " btn--solid") + '" href="' + esc(doc) + '" target="_blank" rel="noopener">' + iconFor(doc) + (past ? "Open the notes" : "Open the agenda and notes") + '<span class="sr"> (opens in a new tab)</span></a>' : "") +
      "</div>" +
      '<ul class="roles"><li>' + bullet(lead, "sm") + "<span><b>" + esc(first(lead.name)) + "</b> leads and sends the agenda</span></li>" +
      "<li>" + bullet(notes, "sm") + "<span><b>" + esc(first(notes.name)) + "</b> takes notes</span></li></ul></div></section>";
  }

  function meetingDetail(m) {
    var past = new Date(m.end || m.start) < new Date();
    var topics = state.data.topics.filter(function (t) { return t.meetingId === m.id; });
    var topicList = topics.length ? '<ul class="topics">' + topics.map(function (t) {
      var who = member(t.memberId);
      return "<li>" + (t.memberId ? bullet(who, "sm") : "") + '<span class="topics__text">' + esc(t.text) + (t.memberId ? '<small>Suggested by ' + esc(first(who.name)) + "</small>" : "") + "</span>" +
        (past ? "" : '<button type="button" class="btn btn--quiet" data-act="remove-topic" data-id="' + esc(t.id) + '">Remove<span class="sr"> the topic ' + esc(t.text) + "</span></button>") + "</li>";
    }).join("") + "</ul>" : '<p class="empty">No topics suggested yet.</p>';
    var html = '<section class="section" aria-labelledby="ag-h"><h2 id="ag-h">Agenda</h2><p class="agenda-status">' + agendaBadge(m) + "</p>";
    if (!past) {
      var lead = member(LEAD);
      html += '<div class="lead-box"><h3>' + esc(first(lead.name)) + "'s steps as meeting lead</h3><ol class=\"steps\">" +
        "<li>" + (m.docUrl ? '<a class="ilink" href="' + esc(m.docUrl) + '" target="_blank" rel="noopener">' + iconFor(m.docUrl, true) + 'Open the meeting doc<span class="sr"> (opens in a new tab)</span></a>. The date, Meet link and next meeting are already filled in.' : "Wait for the meeting doc. The hub makes it about a week before, with the date and Meet link filled in.") + "</li>" +
        "<li>In the Agenda section, list 3 to 5 topics, each with who leads it and how many minutes. Move in any topics the team suggested below.</li>" +
        "<li>Come back here and share the agenda. It emails everyone the list and the Meet link, and ticks off your agenda assignment.</li></ol>" +
        '<div class="actions"><button type="button" class="btn ' + (m.agendaSharedAt ? "" : "btn--solid") + '" data-act="share-agenda" data-id="' + esc(m.id) + '"' + (m.docUrl ? "" : " disabled") + ">" + (m.agendaSharedAt ? "Share the agenda again" : "Share the agenda") + "</button></div></div>";
    }
    html += "</section>";
    html += '<section class="section" aria-labelledby="tp-h"><h2 id="tp-h">Suggested topics</h2>' +
      '<p class="section__note">' + (past ? "Topics people suggested for this meeting." : "Anyone can suggest a topic. It also appears in the meeting doc under Suggested by the team, and " + esc(first(member(LEAD).name)) + " decides what goes on the agenda.") + "</p>" + topicList +
      (past ? "" : '<form class="topic-form" id="topic-form" data-id="' + esc(m.id) + '"><div class="field"><label for="topic-text">Suggest a topic</label><textarea id="topic-text" name="text" maxlength="300" required placeholder="For example: Review the farmer guide outline"></textarea></div>' +
        whoSelect("topic-who", "Your name") + '<div><button type="submit" class="btn btn--solid">Add topic</button></div></form>') + "</section>";
    return html;
  }

  function meetingRow(m) {
    var s = new Date(m.start), st = agendaState(m), past = new Date(m.end || m.start) < new Date();
    var n = state.data.topics.filter(function (t) { return t.meetingId === m.id; }).length;
    var meta = past ? (m.docUrl ? "<span>Notes doc</span>" : "<span>No doc</span>") : (m.docUrl ? "<span>Doc ready</span>" : "<span>Doc is made a week before</span>");
    return '<li class="row' + (past ? " is-done" : "") + '"><a href="#/mt/' + esc(m.id) + '"><span class="row__main"><span class="row__title">' + esc(fmtDay(s)) + " meeting</span>" +
      '<span class="row__meta">' + (past || !m.docUrl ? "" : '<span class="st">' + shape(st.key) + (st.key === "done" ? "Agenda shared" : st.key === "late" ? "Agenda late" : "Agenda not shared yet") + "</span>") + meta + (n ? "<span>" + n + (n === 1 ? " topic" : " topics") + "</span>" : "") + "</span></span>" +
      '<span class="row__due"><span class="row__day">' + esc(meetTime(m)) + '</span><span class="row__rel">' + esc(meetRel(m)) + "</span></span></a></li>";
  }

  function viewMeetings() {
    var all = meetings(), next = nextMeeting(), now = new Date();
    var upcoming = all.filter(function (m) { return new Date(m.end || m.start) > now && m !== next; }).slice(0, 4);
    var notes = pastNotes();
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Meetings</h1><p>Weekly with our client on Google Meet. ' + esc(first(member(LEAD).name)) + " leads and sends the agenda, and " + esc(first(member(NOTES).name)) + " takes notes. Each meeting gets its own doc for the agenda and the notes.</p>" +
      '<nav class="jump" aria-label="On this page"><a href="#/meetings/next">Next meeting</a><a href="#/meetings/notes">Past meeting notes (' + notes.length + ')</a>' + (upcoming.length ? '<a href="#/meetings/upcoming">Coming up</a>' : "") + "</nav></div>" +
      '<div id="next">' + (next ? meetingCard(next, "Next meeting") + meetingDetail(next) : '<p class="empty">No meetings on the calendar.</p>') + "</div>" +
      notesSection(notes) +
      (upcoming.length ? '<section class="section" id="upcoming" aria-labelledby="up-h"><h2 id="up-h">Coming up</h2><ul class="rows">' + upcoming.map(meetingRow).join("") + "</ul></section>" : "") + "</div>";
  }

  /* Past meeting notes: every dated doc in the Meetings folder (from the backend), plus past calendar meetings that have a doc. */
  function pastNotes() {
    var today = parts(new Date()), todayId = today.year + "-" + today.month + "-" + today.day, seen = {}, list = [];
    function docId(u) { var m = /\/d\/([\w-]+)/.exec(u || ""); return m ? m[1] : u; }
    (state.data.notes || []).forEach(function (n) { seen[docId(n.url)] = true; list.push(n); });
    meetings().forEach(function (m) {
      if (!m.docUrl || m.id > todayId || seen[docId(m.docUrl)]) return;
      list.push({ id: m.id, date: m.id, title: "Meeting with " + CLIENT, takeaway: "", url: m.docUrl });
    });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function noteDate(iso) { var p = iso.split("-"); return fmtDay(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 20))); }
  function notesSection(notes) {
    var items = notes.map(function (n) {
      var hay = (n.title + " " + n.takeaway + " " + noteDate(n.date) + " " + n.date).toLowerCase();
      return '<li class="note" data-hay="' + esc(hay) + '"><a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener">' +
        '<span class="note__when">' + esc(noteDate(n.date)) + '</span><span class="note__main"><span class="note__title">' + iconFor(n.url, true) + esc(n.title) + "</span>" +
        (n.takeaway ? '<span class="note__take"><b>Key takeaway:</b> ' + esc(n.takeaway) + "</span>" : '<span class="note__take note__take--none">No key takeaway written yet</span>') +
        '</span><span class="note__go">Open the notes<span class="sr"> (opens in a new tab)</span></span></a></li>';
    }).join("");
    return '<section class="section" id="notes" aria-labelledby="notes-h"><h2 id="notes-h">Past meeting notes</h2>' +
      '<p class="section__note">Newest first. Each one opens the meeting\'s Google Doc. Search covers the title and key takeaway.</p>' +
      (notes.length > 2 ? '<div class="field notes-search"><label for="notes-q">Search past notes</label><input id="notes-q" type="search" autocomplete="off" placeholder="For example: Agrocalidad, survey, Sep 30"></div>' : "") +
      (notes.length ? '<ul class="notes">' + items + '</ul><p class="empty" id="notes-none" hidden>No notes match that search.</p>'
        : '<p class="empty">' + (state.demo ? "Notes from past meetings show up here once the Google Sheet backend is connected." : "No meeting notes yet. They appear here after each meeting.") + "</p>") +
      (cfg.meetingsFolderUrl ? '<div class="actions"><a class="btn" href="' + esc(cfg.meetingsFolderUrl) + '" target="_blank" rel="noopener">' + gIcon("drive") + 'Open the Meetings folder<span class="sr"> (opens in a new tab)</span></a></div>' : "") + "</section>";
  }

  function viewMeeting(id) {
    var m = meetingById(id);
    if (!m) return notFound("That meeting isn't on the calendar anymore.");
    var past = new Date(m.end || m.start) < new Date();
    return '<div class="wrap"><div class="head" style="padding-bottom:8px"><a class="crumb" href="#/meetings">Meetings</a><h1 tabindex="-1">' + esc(fmtDay(new Date(m.start))) + " meeting</h1></div>" +
      meetingCard(m, past ? "Past meeting" : "Meeting") + meetingDetail(m) + "</div>";
  }

  function nextMeetingStrip() {
    var m = nextMeeting(); if (!m) return "";
    var link = safeUrl(m.meetLink), s = new Date(m.start);
    return '<section class="next-meet" aria-label="Next meeting"><p><span class="next-meet__label">Next meeting</span> <a href="#/mt/' + esc(m.id) + '"><b>' + esc(fmtDay(s)) + ", " + esc(fmtTime(s)) + "</b></a> <span class=\"next-meet__rel\">" + esc(meetRel(m)) + "</span></p>" +
      '<div class="actions" style="margin-top:0">' + (link ? '<a class="btn btn--solid" href="' + esc(link) + '" target="_blank" rel="noopener">' + gIcon("meet") + 'Join Google Meet<span class="sr"> (opens in a new tab)</span></a>' : "") +
      '<a class="btn" href="#/mt/' + esc(m.id) + '">Agenda and topics</a><a class="btn btn--quiet" href="#/meetings/notes">Past notes</a></div></section>';
  }

  function shareAgendaDialog(id) {
    var m = meetingById(id); if (!m) return;
    openDialog('<form method="dialog"><div class="dlg__head"><h2>Share the agenda</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body">' +
      "<p>This emails the numbered list from the Agenda section of the " + esc(fmtDay(new Date(m.start))) + " meeting doc to the whole team, with the Meet link and the doc. Check the doc first: whatever is there now is what gets sent.</p>" +
      '<label class="check"><input type="checkbox" name="includeClient" value="1" checked> Also send it to our client</label>' +
      whoSelect("share-who", "Sending as", store.get("me") || LEAD) +
      '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Send the agenda</button></div></form>',
      function (v) {
        if (v.who) store.set("me", v.who);
        return apiPost({ action: "shareAgenda", meetingId: id, includeClient: !!v.includeClient }).then(function (r) {
          m.agendaSharedAt = new Date().toISOString(); m.agendaSharedBy = v.who || "";
          var job = byId(state.data.assignments, "m-" + id + "-agenda"); if (job) job.status = "done";
          route(); toast(r.demo ? "Agenda shared (demo, no email sent)" : "Agenda sent to " + (r.sentTo || "the team") + " people");
        });
      });
  }

  function removeTopicDialog(id) {
    var t = byId(state.data.topics, id); if (!t) return;
    openDialog('<form method="dialog"><div class="dlg__head"><h2>Remove this topic?</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body">' +
      "<p><b>" + esc(t.text) + "</b> will be removed from the hub and from Suggested by the team in the meeting doc. If " + esc(first(member(LEAD).name)) + " already moved it into the agenda, that copy stays.</p>" +
      '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Keep it</button><button type="submit" class="btn btn--solid">Remove topic</button></div></form>',
      function () {
        return apiPost({ action: "deleteTopic", id: id }).then(function (r) {
          state.data.topics = state.data.topics.filter(function (x) { return x.id !== id; });
          route(); toast("Topic removed" + (r.demo ? " (demo, not saved)" : ""));
        });
      });
  }

  function addTopic(form) {
    var id = form.getAttribute("data-id"), text = form.querySelector("textarea").value.replace(/\s+/g, " ").trim(), who = form.querySelector("select").value;
    if (!text) { form.querySelector("textarea").focus(); return; }
    if (!who) { toast("Pick your name first"); form.querySelector("select").focus(); return; }
    store.set("me", who);
    var t = { id: newId("t"), meetingId: id, text: text, memberId: who, createdAt: new Date().toISOString() };
    state.data.topics.push(t); route();
    apiPost({ action: "addTopic", meetingId: id, text: text }).then(function (r) {
      if (r.topic) Object.assign(t, r.topic);
      toast(r.demo ? "Topic added (demo, not saved)" : "Topic added to the meeting doc");
      var ta = document.getElementById("topic-text"); if (ta) ta.focus();
    }).catch(function (e) {
      state.data.topics = state.data.topics.filter(function (x) { return x !== t; }); route(); toast("Not added: " + e.message);
    });
  }

  /* ---------- about and FAQ ---------- */
  function viewAbout() {
    var pm = first(member(cfg.pmMemberId || "gregor").name), lead = first(member(LEAD).name), notes = first(member(NOTES).name);
    function role(title, steps) { return '<section class="about-role"><h3>' + title + '</h3><ol class="steps">' + steps.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol></section>"; }
    function faq(q, a) { return '<details class="faq"><summary>' + q + '</summary><div class="faq__a">' + a + "</div></details>"; }
    var legend = ["todo", "doing", "done", "late"].map(function (k) {
      var what = { todo: "Not started yet.", doing: "Someone is working on it.", done: "Finished. Team deadlines say Submitted.", late: "The due date has passed and it isn't done." }[k];
      return '<li><span class="st">' + shape(k) + LABEL[k] + "</span><span>" + what + "</span></li>";
    }).join("");
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">About this hub</h1><p>One place for our assignments, class deadlines and meetings, so nobody has to dig through group chats or long emails. It reads and saves everything in a Google Sheet in the team Drive.</p></div>' +
      '<section class="section" aria-labelledby="how-h"><h2 id="how-h">How to use it</h2><div class="about-roles">' +
      role("Everyone", ["On <a href=\"#/\">Team</a>, tap your name. You'll see what's overdue, what's due in the next 7 days, and what's later.", "Open an assignment for the steps, the due date and a button to the right Google Doc.", "When you start, set it to <b>In progress</b>. When you finish, set it to <b>Done</b>. Everyone sees the change right away.", "Got something for the next meeting? Add it on <a href=\"#/meetings\">Meetings</a> under Suggest a topic."]) +
      role(esc(lead) + ", meeting lead", ["About a week before each meeting, the hub makes the meeting doc with the date, Meet link and next meeting filled in, and gives you an agenda assignment.", "Open the doc from <a href=\"#/meetings\">Meetings</a> and list 3 to 5 topics in the Agenda section, each with who leads it and how long.", "Look under Suggested by the team for topics people added, and move in the ones you want.", "Click <b>Share the agenda</b> on the Meetings page. It emails everyone and ticks off your assignment."]) +
      role(esc(notes) + ", note-taker", ["Take notes in the same meeting doc, under Discussion points, Decisions and Action items.", "Within 24 hours, merge the Meetily summary and give every action item an owner and a due date.", "Tell " + esc(pm) + " which action items should become assignments here."]) +
      role(esc(pm) + ", project manager", ["Use <a href=\"#/pm\">Project view</a> to see everything by project and filter by person or status.", "Add assignments there or from a team deadline's page. One assignment can go to several people, each with their own steps.", "Your code is only needed for adding, editing and deleting. Every morning you get a summary email."]) +
      "</div></section>" +
      '<section class="section" aria-labelledby="sym-h"><h2 id="sym-h">What the symbols mean</h2><p class="section__note">Each status has its own shape and word, so color is never the only clue.</p><ul class="legend">' + legend + "</ul></section>" +
      '<section class="section" aria-labelledby="faq-h"><h2 id="faq-h">Questions</h2>' +
      faq("My assignment is wrong, or something is missing.", "<p>Tell " + esc(pm) + ". Only the project manager can add, change or delete assignments. That keeps one person responsible for the list.</p>") +
      faq("What's the difference between an assignment and a team deadline?", "<p>An assignment is yours: one person, one task, one due date. A team deadline belongs to the whole team, like a class assignment or the final presentation. Team deadlines show at the bottom of everyone's list, and anyone can mark one <b>Submitted</b> once it's turned in.</p>") +
      faq("How do I tell work for " + esc(CLIENT) + " apart from class work?", "<p>Look for the tag. Work for " + esc(CLIENT) + " has a filled " + forTag({ audience: "client" }, true) + " tag, and class assignments have an outlined " + forTag({ audience: "class" }, true) + " tag. <a href=\"#/deliverables\">Deliverables</a> lists both side by side, including things " + esc(CLIENT) + " mentioned that we haven't agreed to yet.</p>") +
      faq("I made a typo in a suggested topic.", "<p>On <a href=\"#/meetings\">Meetings</a>, click <b>Remove</b> next to the topic and add it again. Removing it also takes it out of the meeting doc.</p>") +
      faq("What emails will I get, and can I turn them down?", "<p>At most one reminder email a day, at 8 AM, and only on days when something of yours is due in the next 2 days, overdue, or newly assigned to you. Every item in it links straight to its page here. Overdue items come up the day after they're due, then every third day, not every morning. You also get the agenda email from " + esc(lead) + " before each meeting.</p><p>To change how often, open your page from <a href=\"#/\">Team</a> and scroll to Email reminders: Daily, Mondays only, or Off. Nothing is added to your personal Google Calendar. If you want a deadline there, open it here and click <b>Add to Google Calendar</b>.</p>") +
      faq("Where do I actually do the work?", "<p>In the Google Doc, Sheet or bCourses page linked from each assignment. The hub only tracks who is doing what and when. <a href=\"#/files\">Files</a> lists everything in the team Drive folder.</p>") +
      faq("How do I suggest a topic for a meeting?", "<p>Go to <a href=\"#/meetings\">Meetings</a>, type it under Suggest a topic, pick your name and click <b>Add topic</b>. It's added to the meeting doc under Suggested by the team, and " + esc(lead) + " decides what makes the agenda.</p>") +
      faq("Where are the notes from past meetings?", "<p>Go to <a href=\"#/meetings/notes\">Past meeting notes</a> on the Meetings page. It lists every meeting doc, newest first, with its key takeaway, and has a search box. Each one opens the Google Doc. They all live in the Meetings folder of the team Drive, named with their date.</p>") +
      faq("A meeting moved or got cancelled.", "<p>Change it in Google Calendar. " + esc(lead) + " owns the weekly event. The hub checks the calendar at 6 AM and 6 PM and updates the Meetings page on its own.</p>") +
      faq("I finished something that isn't on my list.", "<p>Great. Mention it to " + esc(pm) + " or at the next meeting so it can be added and counted.</p>") +
      faq("What is the team code, and what if I lose it?", "<p>It keeps the team's details private. You enter it once on each device. If you lose it, ask " + esc(pm) + ". Please don't share it outside the team.</p>") +
      faq("It says my change wasn't saved.", "<p>Usually a dropped connection. Reload the page and try again. If it keeps happening, tell " + esc(pm) + ".</p>") +
      faq("Does it work on my phone, with a screen reader, or in dark mode?", "<p>Yes. It fits small screens, follows your device's dark mode, and works with a keyboard and screen readers. Buttons are large enough to tap easily.</p>") +
      faq("Why does the text look different?", "<p>The hub uses Atkinson Hyperlegible Next, a typeface from the Braille Institute designed so letters like l, 1 and I are easy to tell apart.</p>") +
      "</section></div>";
  }

  function viewGate(msg) {
    return '<div class="wrap"><form class="gate" id="gate"><h1 tabindex="-1">Enter the team code</h1><p>Gregor shared this code with the team. You only need to enter it once on this device.</p>' +
      '<div class="field"><label for="code">Team code</label><input id="code" type="password" autocomplete="current-password" required></div>' +
      (msg ? '<p class="error" role="alert">' + esc(msg) + "</p>" : "") + '<div><button class="btn btn--solid" type="submit">Continue</button></div></form></div>';
  }
  function notFound(msg) {
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/">Team</a><h1 tabindex="-1">Not found</h1><p>' + esc(msg) + "</p></div></div>";
  }

  /* ---------- router ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("/");
    var view = h[0] || "home";
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      var pv = view === "p" && state.data ? byId(state.data.projects, h[1]) : null;
      var on = a.getAttribute("data-nav") === (view === "p" && pv && pv.audience ? "deliverables" : view === "m" || view === "a" || view === "p" ? "home" : view === "mt" ? "meetings" : view);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!state.data) return;
    var html, title = "Microbe Busters Hub";
    if (view === "m") { html = viewMember(h[1]); title = member(h[1]).name + ", assignments"; }
    else if (view === "a") { var a = byId(state.data.assignments, h[1]); html = viewAssignment(h[1]); if (a) title = a.title; }
    else if (view === "p") { var pj = byId(state.data.projects, h[1]); html = viewProject(h[1]); if (pj) title = pj.name; }
    else if (view === "pm") { html = viewPM(); title = "Project view"; }
    else if (view === "files") { html = viewFiles(); title = "Team files"; }
    else if (view === "meetings") { html = viewMeetings(); title = "Meetings"; }
    else if (view === "deliverables") { html = viewDeliverables(); title = "Deliverables"; }
    else if (view === "mt") { var mt = meetingById(h[1]); html = viewMeeting(h[1]); if (mt) title = fmtDay(new Date(mt.start)) + " meeting"; }
    else if (view === "about") { html = viewAbout(); title = "About and FAQ"; }
    else { html = viewHome(); }
    main.innerHTML = html;
    document.title = title + (title === "Microbe Busters Hub" ? "" : " | Microbe Busters Hub");
    var h1 = main.querySelector("h1");
    if (route._moved && h1) h1.focus({ preventScroll: true });
    route._moved = true;
    window.scrollTo(0, 0);
    if (view === "meetings" && h[1]) { var sec = document.getElementById(h[1]); if (sec) { sec.scrollIntoView(); var hd = sec.querySelector("h2"); if (hd) { hd.setAttribute("tabindex", "-1"); hd.focus({ preventScroll: true }); } } }
    if (view === "m" && h[2] === "email") { var em = document.getElementById("email-h"); if (em) { em.scrollIntoView(); em.focus({ preventScroll: true }); } }
  }

  /* ---------- writes ---------- */
  function setStatus(id, status) {
    var a = byId(state.data.assignments, id); if (!a) return;
    var prev = { status: a.status, updatedAt: a.updatedAt, updatedBy: a.updatedBy };
    a.status = status; a.updatedAt = new Date().toISOString(); a.updatedBy = store.get("me") || "";
    route();
    apiPost({ action: "setStatus", id: id, status: status }).then(function (r) {
      toast(r.demo ? "Marked " + LABEL[status].toLowerCase() + " (demo, not saved)" : "Marked " + LABEL[status].toLowerCase());
    }).catch(function (e) {
      a.status = prev.status; a.updatedAt = prev.updatedAt; a.updatedBy = prev.updatedBy; route();
      toast("Not saved: " + e.message);
    });
  }

  function setProjectStatus(id) {
    var p = byId(state.data.projects, id); if (!p) return;
    var prev = p.status, next = p.status === "done" ? "" : "done";
    p.status = next; route();
    apiPost({ action: "setProjectStatus", id: id, status: next }).then(function (r) {
      toast((next ? "Marked " : "Marked not ") + doneWord(p).toLowerCase() + (r.demo ? " (demo, not saved)" : ""));
    }).catch(function (e) { p.status = prev; route(); toast("Not saved: " + e.message); });
  }

  function needPmCode() { return !state.demo && !store.get("pmCode"); }
  function pmCodeField() {
    return needPmCode() ? '<div class="field"><label for="pm-code">Project manager code</label><input id="pm-code" name="pmCode" type="password" autocomplete="off" required><small>Needed once per device to add or change assignments.</small></div>' : "";
  }
  function openDialog(html, onSubmit) {
    var dlg = document.createElement("dialog");
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    var close = function () { dlg.close(); dlg.remove(); };
    dlg.addEventListener("close", function () { if (dlg.parentNode) dlg.remove(); });
    dlg.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
    var form = dlg.querySelector("form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(form), vals = {};
      fd.forEach(function (v, k) { if (vals[k] !== undefined) { vals[k] = [].concat(vals[k], v); } else { vals[k] = v; } });
      if (vals.pmCode) store.set("pmCode", vals.pmCode);
      var btn = form.querySelector('[type="submit"]'), btnText = btn ? btn.textContent : "";
      var reset = function () { if (btn) { btn.disabled = false; btn.classList.remove("is-working"); btn.textContent = btnText; } };
      if (btn) { btn.disabled = true; btn.classList.add("is-working"); btn.textContent = state.demo ? btnText : "Working on it"; }
      Promise.resolve(onSubmit(vals, dlg)).then(function (ok) { if (ok !== false) close(); else reset(); })
        .catch(function (e) {
          reset();
          if (e && e.code === "pm") store.del("pmCode");
          var err = form.querySelector(".error") || document.createElement("p");
          err.className = "error"; err.setAttribute("role", "alert"); err.textContent = "Not saved: " + (e && e.message ? e.message : "try again.");
          form.querySelector(".dlg__body").appendChild(err);
        });
    });
    dlg.showModal();
    var firstInput = dlg.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();
    return dlg;
  }

  function assignmentForm(a, projectId) {
    var editing = !!a;
    a = a || { projectId: projectId || store.get("f.proj") || (state.data.projects[0] || {}).id, due: "", title: "", instructions: "", link: "", linkLabel: "" };
    var lp = localParts(a.due);
    var fileOpts = (state.data.files || []).map(function (f) { return '<option value="' + esc(f.url) + '">' + esc(f.name) + "</option>"; }).join("");
    var who = editing
      ? '<div class="field"><label for="as-who">Assigned to</label><select id="as-who" name="memberId">' + state.data.members.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === a.memberId ? " selected" : "") + ">" + esc(m.name) + "</option>"; }).join("") + "</select></div>"
      : '<fieldset class="checks"><legend>Assign to (one copy each)</legend>' + state.data.members.map(function (m) { return '<label class="check"><input type="checkbox" name="memberIds" value="' + esc(m.id) + '"> ' + bullet(m, "sm") + " " + esc(m.name) + "</label>"; }).join("") + "</fieldset>";
    return '<form method="dialog"><div class="dlg__head"><h2>' + (editing ? "Edit assignment" : "New assignment") + '</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body">' +
      '<div class="field"><label for="as-proj">Project</label><select id="as-proj" name="projectId">' + state.data.projects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === a.projectId ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select></div>" + who +
      '<div class="field"><label for="as-title">Title</label><input id="as-title" name="title" type="text" required value="' + esc(a.title) + '"><small>Start with a verb, for example "Draft the pre-harvest section".</small></div>' +
      '<div class="field"><label for="as-ins">What to do</label><textarea id="as-ins" name="instructions">' + esc(a.instructions) + "</textarea><small>One step per line. Start lines with a dash to make a numbered list.</small></div>" +
      '<div class="two"><div class="field"><label for="as-date">Due date</label><input id="as-date" name="date" type="date" value="' + esc(lp.date) + '"></div><div class="field"><label for="as-time">Due time</label><input id="as-time" name="time" type="time" value="' + esc(lp.time) + '"></div></div>' +
      (fileOpts ? '<div class="field"><label for="as-file">Link a file from the team folder</label><select id="as-file" name="file"><option value="">None</option>' + fileOpts + "</select></div>" : "") +
      '<div class="field"><label for="as-link">Or paste a link</label><input id="as-link" name="link" type="url" value="' + esc(a.link) + '" placeholder="https://"></div>' +
      '<div class="field"><label for="as-label">Button text for the link</label><input id="as-label" name="linkLabel" type="text" value="' + esc(a.linkLabel) + '" placeholder="Open the document"></div>' +
      pmCodeField() + '</div><div class="dlg__foot">' +
      (editing ? '<button type="button" class="btn btn--danger" data-act="delete-assignment" data-id="' + esc(a.id) + '">Delete assignment</button>' : "") +
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">' + (editing ? "Save changes" : "Create assignment") + "</button></div></form>";
  }

  function saveAssignment(existing, v) {
    var link = v.file || v.link || "";
    var base = { projectId: v.projectId, title: String(v.title || "").trim(), instructions: v.instructions || "", due: zonedIso(v.date, v.time), link: link, linkLabel: v.linkLabel || "" };
    var list;
    if (existing) {
      list = [Object.assign({}, existing, base, { memberId: v.memberId })];
    } else {
      var ids = [].concat(v.memberIds || []);
      if (!ids.length) return Promise.reject(new Error("Pick at least one person."));
      list = ids.map(function (mid) { return Object.assign({ id: newId("a"), memberId: mid, status: "todo" }, base); });
    }
    return apiPost({ action: "saveAssignments", assignments: list }).then(function (r) {
      var saved = r.assignments || list;
      saved.forEach(function (s) {
        var i = state.data.assignments.findIndex(function (x) { return x.id === s.id; });
        if (i > -1) state.data.assignments[i] = s; else state.data.assignments.push(s);
      });
      route();
      toast((existing ? "Saved" : "Created " + saved.length + (saved.length === 1 ? " assignment" : " assignments")) + (r.demo ? " (demo, not saved)" : ""));
    });
  }

  function confirmDelete(id) {
    var a = byId(state.data.assignments, id); if (!a) return;
    openDialog('<form method="dialog"><div class="dlg__head"><h2>Delete this assignment?</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body"><p><b>' + esc(a.title) + "</b> will be removed from " + esc(first(member(a.memberId).name)) + "'s list and from the deadlines calendar. This can't be undone.</p>" + pmCodeField() +
      '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Keep it</button><button type="submit" class="btn btn--solid">Delete assignment</button></div></form>', function () {
      return apiPost({ action: "deleteAssignment", id: id }).then(function (r) {
        state.data.assignments = state.data.assignments.filter(function (x) { return x.id !== id; });
        route(); toast("Deleted" + (r.demo ? " (demo, not saved)" : ""));
      });
    });
  }

  function projectForm(p) {
    var editing = !!p; p = p || { name: "", due: "", link: "", description: "", courseLink: "", status: "", audience: projectForm.preset || "", scope: projectForm.preset === "client" ? "confirmed" : "" };
    projectForm.preset = "";
    var lp = localParts(p.due);
    return '<form method="dialog"><div class="dlg__head"><h2>' + (editing ? "Edit project" : "New project") + '</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body">' +
      '<div class="field"><label for="pj-name">Name</label><input id="pj-name" name="name" type="text" required value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label for="pj-desc">Description</label><textarea id="pj-desc" name="description" style="min-height:160px">' + esc(p.description) + '</textarea><small>Start lines with a dash for a list. Links: paste the address, or write [link text](https://...).</small></div>' +
      '<div class="two"><div class="field"><label for="pj-date">Due date</label><input id="pj-date" name="date" type="date" value="' + esc(lp.date) + '"></div><div class="field"><label for="pj-time">Due time</label><input id="pj-time" name="time" type="time" value="' + esc(lp.time) + '"></div></div>' +
      '<div class="field"><label for="pj-link">Main document link</label><input id="pj-link" name="link" type="url" value="' + esc(p.link) + '" placeholder="https://"></div>' +
      '<div class="two"><div class="field"><label for="pj-aud">Who is it for?</label><select id="pj-aud" name="audience">' +
        [["client", "For " + CLIENT], ["class", "DevEng C200 (class)"], ["", "Just the team"]].map(function (o) { return '<option value="' + o[0] + '"' + ((p.audience || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="pj-scope">Agreed with ' + esc(CLIENT) + '?</label><select id="pj-scope" name="scope">' +
        [["confirmed", "Agreed"], ["to-confirm", "Not confirmed yet"], ["on-hold", "On hold"], ["", "Doesn't apply"]].map(function (o) { return '<option value="' + o[0] + '"' + ((p.scope || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select><small>Only for deliverables for " + esc(CLIENT) + ".</small></div></div>" +
      '<div class="field"><label for="pj-course">bCourses page</label><input id="pj-course" name="courseLink" type="url" value="' + esc(p.courseLink || "") + '" placeholder="https://bcourses.berkeley.edu/..."><small>Leave empty if it isn\'t a class assignment.</small></div>' + pmCodeField() +
      '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">' + (editing ? "Save changes" : "Create project") + "</button></div></form>";
  }
  function saveProject(existing, v) {
    var p = Object.assign({}, existing || { id: newId("p") }, { name: String(v.name || "").trim(), description: v.description || "", due: zonedIso(v.date, v.time), link: v.link || "", courseLink: v.courseLink || "", audience: v.audience || "", scope: v.audience === "client" ? (v.scope || "") : "" });
    return apiPost({ action: "saveProject", project: p }).then(function (r) {
      var i = state.data.projects.findIndex(function (x) { return x.id === p.id; });
      if (r.project) p = r.project;
      if (i > -1) state.data.projects[i] = p; else state.data.projects.push(p);
      route(); toast((existing ? "Project saved" : "Project created") + (r.demo ? " (demo, not saved)" : ""));
    });
  }

  /* ---------- events ---------- */
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.name === "status" && t.closest("[data-status-for]")) setStatus(t.closest("[data-status-for]").getAttribute("data-status-for"), t.value);
    if (t.name === "emailPref" && t.closest("[data-email-for]")) setEmailPref(t.closest("[data-email-for]").getAttribute("data-email-for"), t.value);
    if (t.closest && t.closest("#pm-filter")) {
      store.set("f.who", document.getElementById("f-who").value);
      store.set("f.proj", document.getElementById("f-proj").value);
      store.set("f.st", document.getElementById("f-st").value);
      route();
      var again = document.getElementById(t.id); if (again) again.focus();
    }
  });
  document.addEventListener("input", function (ev) {
    if (ev.target.id === "notes-q") {
      var nq = ev.target.value.trim().toLowerCase(), shown = 0;
      document.querySelectorAll(".notes .note").forEach(function (li) { var hit = !nq || li.getAttribute("data-hay").indexOf(nq) > -1; li.hidden = !hit; if (hit) shown++; });
      var none = document.getElementById("notes-none"); if (none) none.hidden = shown > 0;
      return;
    }
    if (ev.target.id !== "file-q") return;
    var q = ev.target.value.trim().toLowerCase();
    document.querySelectorAll(".files li").forEach(function (li) { li.hidden = q && li.getAttribute("data-name").indexOf(q) === -1; });
    document.querySelectorAll(".file-group").forEach(function (g) { g.hidden = !g.querySelector("li:not([hidden])"); });
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (act === "new-assignment") openDialog(assignmentForm(null, b.getAttribute("data-project")), function (v) { return saveAssignment(null, v); });
    if (act === "project-status") setProjectStatus(id);
    if (act === "edit-assignment") { var a = byId(state.data.assignments, id); openDialog(assignmentForm(a), function (v) { return saveAssignment(a, v); }); }
    if (act === "delete-assignment") { ev.preventDefault(); var d = b.closest("dialog"); if (d) { d.close(); } confirmDelete(id); }
    if (act === "new-project") openDialog(projectForm(null), function (v) { return saveProject(null, v); });
    if (act === "edit-project") { ev.preventDefault(); var p = byId(state.data.projects, id); openDialog(projectForm(p), function (v) { return saveProject(p, v); }); }
    if (act === "share-agenda") shareAgendaDialog(id);
    if (act === "remove-topic") removeTopicDialog(id);
    if (act === "new-deliverable") { projectForm.preset = "client"; openDialog(projectForm(null), function (v) { return saveProject(null, v); }); }
    if (act === "sync-meetings") {
      var go = function () { return apiPost({ action: "syncMeetings" }).then(function (r) { if (r.meetings) state.data.meetings = r.meetings; route(); toast(r.demo ? "Refreshed (demo)" : "Meetings refreshed from Google Calendar"); }); };
      if (needPmCode()) openDialog('<form method="dialog"><div class="dlg__head"><h2>Refresh meetings</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body"><p>Reads the weekly meeting from Google Calendar and makes the doc for any meeting in the next 7 days.</p>' + pmCodeField() + '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Refresh</button></div></form>', go);
      else { b.disabled = true; go().catch(function (e) { toast("Not refreshed: " + e.message); }).then(function () { b.disabled = false; }); }
    }
    if (act === "forget-pm") { store.del("pmCode"); route(); toast("Project manager code removed from this device"); }
    if (act === "send-reminders") {
      if (needPmCode()) {
        openDialog('<form method="dialog"><div class="dlg__head"><h2>Send reminders now</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body"><p>Everyone with work due in the next 2 days or overdue gets an email.</p>' + pmCodeField() + '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Send reminders</button></div></form>',
          function () { return apiPost({ action: "sendReminders" }).then(function (r) { toast("Sent " + (r.sent || 0) + " reminder emails"); }); });
      } else {
        b.disabled = true;
        apiPost({ action: "sendReminders" }).then(function (r) { toast("Sent " + (r.sent || 0) + " reminder emails"); })
          .catch(function (e) { toast("Not sent: " + e.message); }).then(function () { b.disabled = false; });
      }
    }
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "topic-form") { ev.preventDefault(); addTopic(ev.target); return; }
    if (ev.target.id !== "gate") return;
    ev.preventDefault();
    store.set("code", document.getElementById("code").value.trim());
    start();
  });
  window.addEventListener("hashchange", route);

  /* ---------- light and dark mode ---------- */
  function effectiveTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function paintToggle() {
    var b = document.getElementById("theme-toggle"); if (!b) return;
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    b.textContent = next === "light" ? "Light mode" : "Dark mode";
    b.setAttribute("aria-label", "Switch to " + next + " mode");
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store.set("theme", next); paintToggle();
  });
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintToggle); } catch (e) { /* old browsers */ } }
  paintToggle();

  /* ---------- stay on the newest version ----------
     GitHub Pages lets browsers cache files for up to 10 minutes, and Chrome sometimes holds them longer.
     version.json is always fetched fresh; if it names a newer build than this one, the hub refreshes
     the cached files and reloads (on first load), or offers a Reload button (when you come back to the tab). */
  var BUILD = "20261002014853";
  var lastVersionCheck = 0;
  function checkVersion(onLoad) {
    if (BUILD.indexOf("__") === 0) return;            // local copy without a stamp
    lastVersionCheck = Date.now();
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.v || j.v === BUILD) return;
      var tried = null; try { tried = sessionStorage.getItem("mb.reloadedFor"); } catch (e) { /* ignore */ }
      if (onLoad && tried !== j.v) { refreshTo(j.v); return; }
      var n = document.getElementById("update-notice");
      if (!n) { n = document.createElement("div"); n.id = "update-notice"; n.className = "notice"; n.setAttribute("role", "status"); document.getElementById("notice").before(n); }
      n.innerHTML = '<p><b>The hub was updated.</b> <button type="button" class="btn btn--quiet" id="reload-new">Reload to get the new version</button></p>';
      document.getElementById("reload-new").addEventListener("click", function () { refreshTo(j.v); });
    }).catch(function () { /* offline: keep going */ });
  }
  function refreshTo(v) {
    try { sessionStorage.setItem("mb.reloadedFor", v); } catch (e) { /* ignore */ }
    var urls = ["./", "index.html", "assets/app.js?v=" + v, "assets/styles.css?v=" + v, "assets/config.js?v=" + v];
    Promise.all(urls.map(function (u) { return fetch(u, { cache: "reload" }).catch(function () {}); })).then(function () { location.reload(); });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastVersionCheck > 5 * 60000) checkVersion(false);
  });

  function start() {
    if (!state.demo && !store.get("code")) { main.innerHTML = viewGate(""); return; }
    main.innerHTML = skeleton();
    load().then(route).catch(function (e) {
      if (e.code === "team") { store.del("code"); main.innerHTML = viewGate("That code didn't work. Check the code Gregor shared and try again."); return; }
      main.innerHTML = '<div class="wrap"><div class="head"><h1 tabindex="-1">Couldn\'t load assignments</h1><p>' + esc(e.message || "The server didn't respond.") + ' Check your connection, then reload the page.</p><div class="actions"><button class="btn btn--solid" type="button" onclick="location.reload()">Reload</button></div></div></div>';
    });
  }
  checkVersion(true);
  start();
})();
