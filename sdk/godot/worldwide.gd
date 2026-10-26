extends Node
## Worldwide-konto til Godot-spil.
##
## Startes spillet fra Worldwide-launcheren, ligger kontoen i miljøvariabler (WW_API, WW_TOKEN, WW_USER_ID, WW_USER_NAME).
## Så kender spillet spillerens navn og kan gemme fremgang i skyen. Uden launcheren er `active` falsk, og alt
## herfra gør ingenting, så spillet kan stadig køres direkte fra editoren.
##
## Tilføj filen som autoload med navnet "Worldwide" (Project Settings -> Globals). Sæt GAME til spillets id i kataloget.
##
##   Worldwide.display_name("Spiller")       navnet fra kontoen, ellers reservenavnet
##   Worldwide.data                          det der ligger i skyen (Dictionary), tomt til load_save() er færdig
##   Worldwide.save_soon()                   gem data om et øjeblik (samler ændringer)
##   Worldwide.quit()                        luk spillet, efter at der er gemt

signal save_loaded(data: Dictionary)
signal changed

const GAME := "complex"
const SAVE_DELAY := 4.0
const MAX_NAME := 8

var active := false          # kommer spillet fra launcheren, og er der et navn?
var online := false          # har vi et token og en adresse?
var api := ""
var token := ""
var user_id := ""
var user_name := ""
var rev := 0
var data: Dictionary = {}
var loaded := false

var _dirty := false
var _busy := false
var _timer: Timer
var _layer: CanvasLayer
var _label: Label
var _tween: Tween

func _ready() -> void:
	api = OS.get_environment("WW_API").rstrip("/")
	token = OS.get_environment("WW_TOKEN")
	user_id = OS.get_environment("WW_USER_ID")
	user_name = OS.get_environment("WW_USER_NAME")
	for a in OS.get_cmdline_user_args():     # alternativ til miljøvariabler, til test
		if a.begins_with("--ww-api="): api = a.substr(9).rstrip("/")
		elif a.begins_with("--ww-token="): token = a.substr(11)
		elif a.begins_with("--ww-name="): user_name = a.substr(10)
		elif a.begins_with("--ww-id="): user_id = a.substr(8)
	active = user_name != ""
	online = active and token != "" and api != "" and OS.get_environment("WW_OFFLINE") != "1"
	if not active:
		return
	get_tree().auto_accept_quit = false
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.timeout.connect(flush)
	add_child(_timer)
	_build_badge()
	_show_badge(false)
	if online:
		load_save()

## Navnet fra kontoen, ellers reservenavnet.
func display_name(fallback: String) -> String:
	return user_name if active else fallback

## Kort, versalt navn til scoreboards og lignende.
func short_name(fallback: String) -> String:
	return user_name.to_upper().substr(0, MAX_NAME) if active else fallback

func load_save() -> void:
	var r := await _request(HTTPClient.METHOD_GET, "/v1/saves/" + GAME)
	if r.ok:
		rev = int(r.json.get("rev", 0))
		var d = r.json.get("data", null)
		data = d if d is Dictionary else {}
		loaded = true
		save_loaded.emit(data)
		changed.emit()
		_show_badge(false)
	elif r.status == 401:
		online = false
		_show_badge(true, "session udløbet")

func save_soon() -> void:
	if not online:
		return
	_dirty = true
	if _timer.is_stopped():
		_timer.start(SAVE_DELAY)

func flush() -> void:
	if not online or not _dirty or _busy:
		return
	_busy = true
	_dirty = false
	var r := await _request(HTTPClient.METHOD_PUT, "/v1/saves/" + GAME, {"data": data, "baseRev": rev})
	if r.ok:
		rev = int(r.json.get("rev", rev))
		_show_badge(true, "gemt")
	elif r.status == 409:                     # en anden enhed har gemt i mellemtiden: flet og prøv igen
		var cur: Dictionary = r.json.get("current", {})
		var theirs = cur.get("data", {})
		data = _merge(theirs if theirs is Dictionary else {}, data)
		rev = int(cur.get("rev", rev))
		_dirty = true
	elif r.status == 401:
		online = false
		_show_badge(true, "session udløbet")
	else:
		_dirty = true                         # ingen forbindelse lige nu, vi prøver igen
	_busy = false
	if _dirty and online:
		_timer.start(SAVE_DELAY * 2.0)

## Luk spillet efter at fremgangen er sendt (højst et par sekunder).
func quit() -> void:
	if active and online and (_dirty or _busy):
		_dirty = true
		var t := get_tree().create_timer(3.0)
		t.timeout.connect(func(): get_tree().quit())
		await flush()
	get_tree().quit()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		quit()

# tal: det højeste vinder · dictionaries: flettes · alt andet: min udgave
func _merge(theirs: Dictionary, mine: Dictionary) -> Dictionary:
	var out := theirs.duplicate(true)
	for k in mine:
		var m = mine[k]
		if out.has(k) and out[k] is Dictionary and m is Dictionary:
			out[k] = _merge(out[k], m)
		elif out.has(k) and (out[k] is int or out[k] is float) and (m is int or m is float):
			out[k] = max(out[k], m)
		else:
			out[k] = m
	return out

func _request(method: HTTPClient.Method, path: String, body: Variant = null) -> Dictionary:
	var req := HTTPRequest.new()
	req.timeout = 12.0
	add_child(req)
	var headers := PackedStringArray(["Authorization: Bearer " + token, "Content-Type: application/json"])
	var err := req.request(api + path, headers, method, "" if body == null else JSON.stringify(body))
	if err != OK:
		req.queue_free()
		return {"ok": false, "status": 0, "json": {}}
	var res: Array = await req.request_completed
	req.queue_free()
	var status: int = res[1]
	var parsed = JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())
	return {"ok": res[0] == HTTPRequest.RESULT_SUCCESS and status >= 200 and status < 300, "status": status, "json": parsed if parsed is Dictionary else {}}

# lille mærke nederst til venstre: hvem er logget ind
func _build_badge() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 100
	add_child(_layer)
	_label = Label.new()
	_label.add_theme_font_size_override("font_size", 15)
	_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.92))
	_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_label.add_theme_constant_override("outline_size", 5)
	_label.anchor_top = 1.0
	_label.anchor_bottom = 1.0
	_label.offset_left = 18
	_label.offset_top = -38
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.modulate.a = 0.0
	_layer.add_child(_label)

func _show_badge(flash: bool, note: String = "") -> void:
	if _label == null:
		return
	var t := "Worldwide · %s" % user_name
	if not online:
		t += " · offline"
	elif note != "":
		t += " · " + note
	_label.text = t
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(_label, "modulate:a", 1.0, 0.35)
	_tween.tween_interval(4.0 if flash else 6.0)
	_tween.tween_property(_label, "modulate:a", 0.0, 0.8)
