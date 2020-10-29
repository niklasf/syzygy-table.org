# This file is part of the syzygy-tables.info tablebase probing website.
# Copyright (C) 2015-2020 Niklas Fiekas <niklas.fiekas@backscattering.de>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.


import json
import os.path

from typing import Dict, TypedDict, List


with open(os.path.join(os.path.dirname(__file__), "..", "stats.json")) as f:
    STATS: Dict[str, EndgameStats] = json.load(f)


class EndgameStats(TypedDict):
    rtbw: TableStats
    rtbz: TableStats
    longest: List[LongEndgame]
    histogram: Histograms


class TableStats(TypedDict):
    bytes: int
    tbcheck: str
    md5: str
    sha1: str
    sha256: str
    sha512: str
    b2: str
    ipfs: str


class Histograms(TypedDict):
    white: Histogram
    black: Histogram


class Histogram(TypedDict):
    win: List[int]
    loss: List[int]


class LongEndgame(TypedDict):
    epd: str
    ply: int
    wdl: int
