#!/bin/sh
# Web-ready sound effects for the platformer: trim silence, even loudness, mono 96 kbit/s.
# Usage: sh tools/process_jump_audio.sh s_power s_powerup ...
cd "$(dirname "$0")/.." || exit 1
for n in "$@"; do
  ffmpeg -v error -y -i "art/src/jump/audio/$n.mp3" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -ac 1 -ar 44100 -b:a 96k "jump/assets/audio/$n.mp3"
  printf '%s %s\n' "$n" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "jump/assets/audio/$n.mp3")"
done
