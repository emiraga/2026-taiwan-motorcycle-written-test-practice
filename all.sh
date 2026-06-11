#!/bin/sh
set -e
set -x

./extract_Hazard_Perception.py
./extract_Regulations.py
./extract_Signs.py
./extract_Written_Test.py
