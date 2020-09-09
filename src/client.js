/**
 * This file is part of the syzygy-tables.info tablebase probing website.
 * Copyright (C) 2015-2020 Niklas Fiekas <niklas.fiekas@backscattering.de>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import $ from 'cash-dom';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';


function strCount(haystack, needle) {
  return haystack.split(needle).length - 1;
}


const DEFAULT_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function normFen(position) {
  const parts = position.fen().split(/\s+/);
  parts[4] = '0';
  parts[5] = '1';
  return parts.join(' ');
}


/* Controller */

function Controller(fen) {
  this.events = {};
  this.position = new Chess(fen || DEFAULT_FEN);
  this.flipped = false;
  this.editMode = false;

  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.fen) {
      const position = new Chess(event.state.fen);
      if (event.state.lastMove) position.move(event.state.lastMove);
      this.setPosition(position);
    } else {
      // Extract the FEN from the query string.
      const fen = location.searchParams.get('fen');
      if (fen) this.setPosition(new Chess(fen.replace(/_/g, ' ')));
    }
  });
}

Controller.prototype.bind = function (event, cb) {
  this.events[event] = this.events[event] || [];
  this.events[event].push(cb);
};

Controller.prototype.trigger = function (event) {
  const args = arguments;
  if (this.events[event]) for (const cb of this.events[event]) {
    cb.apply(this, Array.prototype.slice.call(args, 1));
  }
};

Controller.prototype.toggleFlipped = function () {
  this.flipped = !this.flipped;
  this.trigger('flipped', this.flipped);
};

Controller.prototype.toggleEditMode = function () {
  this.editMode = !this.editMode;
  this.trigger('editMode', this.editMode);
};

Controller.prototype.push = function (position) {
  const fen = normFen(position);
  if (normFen(this.position) != fen && 'pushState' in history) {
    const lastMove = position.undo();
    history.pushState({
      fen: position.fen(),
      lastMove,
    }, null, '/?fen=' + fen.replace(/\s/g, '_'));
    if (lastMove) position.move(lastMove);
  }

  this.setPosition(position);
};

Controller.prototype.pushMove = function (from, to, promotion) {
  const position = new Chess(this.position.fen());
  const moves = position.moves({ verbose: true }).filter((m) => {
    return m.from == from && m.to === to && m.promotion == promotion;
  });

  if (moves.length !== 1) return false;
  else {
    position.move(moves[0]);
    this.push(position);
    return true;
  }
};

Controller.prototype.setPosition = function (position) {
  if (normFen(this.position) != normFen(position)) {
    this.position = position;
    this.trigger('positionChanged', position);
  }
};


/* Board view */

function BoardView(controller) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const ground = this.ground = Chessground(document.getElementById('board'), {
    fen: controller.position.fen(),
    autoCastle: false,
    movable: {
      free: true,
      color: 'both',
      showDests: true,
    },
    selectable: {
      enabled: false,
    },
    draggable: {
      deleteOnDropOff: true,
    },
    animation: {
      enabled: !reducedMotion.matches,
    },
    events: {
      move: (orig, dest) => {
        // If the change is a legal move, play it.
        if (!controller.editMode) controller.pushMove(orig, dest);
      },
      dropNewPiece: (piece, key) => {
        // Move the existing king, even when dropping a new one.
        if (piece.role !== 'king') return;
        const diff = new Map();
        for (const [k, p] of ground.state.pieces) {
          if (p.role === 'king' && p.color === piece.color) diff.set(k, undefined);
        }
        diff.set(key, piece);
        ground.setPieces(diff);
      },
      change: () => {
        // Otherwise just change to position.
        const fenParts = normFen(controller.position).split(/\s/);
        fenParts[0] = this.fenPart = this.ground.getFen();
        controller.push(new Chess(fenParts.join(' ')));
      },
    },
  });

  for (const el of document.querySelectorAll('.spare piece')) {
    for (const eventName of ['touchstart', 'mousedown']) {
      el.addEventListener(eventName, e => {
        e.preventDefault();
        ground.dragNewPiece({
          color: e.target.getAttribute('data-color'),
          role: e.target.getAttribute('data-role'),
        }, e, true);
      }, {passive: false});
    }
  }

  this.setPosition(controller.position);
  controller.bind('positionChanged', (pos) => this.setPosition(pos));

  controller.bind('flipped', (flipped) => this.setFlipped(flipped));

  controller.bind('editMode', (editMode) => {
    ground.set({
      movable: {
        showDests: !editMode,
      },
    });
  });

  reducedMotion.addEventListener?.('change', () => {
    ground.set({
      animation: {
        enabled: !reducedMotion.matches,
      },
    });
  });
}

BoardView.prototype.setPosition = function (position) {
  const history = position.history({ verbose: true }).map((h) => [h.from, h.to]);

  const dests = new Map();
  for (const s of position.SQUARES) {
    const moves = position.moves({ square: s, verbose: true }).map((m) => m.to);
    if (moves.length) dests.set(s, moves);
  }

  const turn = (position.turn() === 'w') ? 'white' : 'black';

  this.ground.set({
    lastMove: history[history.length - 1],
    fen: position.fen(),
    turnColor: turn,
    check: position.in_check() ? turn : false,
    movable: {
      dests,
    },
  });
};

BoardView.prototype.setFlipped = function (flipped) {
  var other = flipped ? 'white' : 'black';
  if (other === this.ground.state.orientation) this.ground.toggleOrientation();
  $('.spare.bottom piece').attr('data-color', this.ground.state.orientation);
  $('.spare.bottom piece').toggleClass('white', this.ground.state.orientation === 'white');
  $('.spare.bottom piece').toggleClass('black', this.ground.state.orientation === 'black');
  $('.spare.top piece').attr('data-color', other);
  $('.spare.top piece').toggleClass('white', other === 'white');
  $('.spare.top piece').toggleClass('black', other === 'black');
};

BoardView.prototype.unsetHovering = function () {
  this.ground.setAutoShapes([]);
};

BoardView.prototype.setHovering = function (uci) {
  this.ground.setAutoShapes([{
    orig: uci.substr(0, 2),
    dest: uci.substr(2, 2),
    brush: 'green',
  }]);
};


/* Side to move buttons */

function SideToMoveView(controller) {
  $('#btn-white').on('click', event => {
    event.preventDefault();
    const fenParts = normFen(controller.position).split(/\s/);
    fenParts[1] = 'w';
    controller.push(new Chess(fenParts.join(' ')));
  });

  $('#btn-black').on('click', event => {
    event.preventDefault();
    const fenParts = normFen(controller.position).split(/\s/);
    fenParts[1] = 'b';
    controller.push(new Chess(fenParts.join(' ')));
  });

  this.setPosition(controller.position);
  controller.bind('positionChanged', pos => this.setPosition(pos));
}

SideToMoveView.prototype.setPosition = function (position) {
  $('#btn-white').toggleClass('active', position.turn() === 'w');
  $('#btn-black').toggleClass('active', position.turn() === 'b');
};


/* FEN input */

function FenInputView(controller) {
  function parseFen(fen) {
    const parts = fen.trim().split(/[\s_]+/);
    if (parts[0] === '') {
      parts[0] = DEFAULT_FEN.split(/\s/)[0];
    }
    if (parts.length === 1) {
      parts.push(controller.position.turn());
    }
    if (parts.length === 2) {
      parts.push('-');
    }
    if (parts.length === 3) {
      parts.push('-');
    }
    if (parts.length === 4) {
      parts.push('0');
    }
    if (parts.length === 5) {
      parts.push('1');
    }

    const position = new Chess();
    if (position.load(parts.join(' '))) return position;
  }

  const input = document.getElementById('fen');
  if (input.setCustomValidity) {
    input.oninput = input.onchange = () => {
      input.setCustomValidity(parseFen(input.value) ? '' : 'Invalid FEN');
    };
  }

  $('#form-set-fen').on('submit', event => {
    event.preventDefault();

    const position = parseFen(input.value);
    if (position) controller.push(position);
    else if (!input.setCustomValidity) input.focus();
  });

  this.setPosition(controller.position);
  controller.bind('positionChanged', pos => this.setPosition(pos));
}

FenInputView.prototype.setPosition = function (position) {
  const fen = normFen(position);
  $('#fen').val(fen === DEFAULT_FEN ? '' : fen);
};


/* Toolbar */

function ToolBarView(controller) {
  $('#btn-flip-board').on('click', () => controller.toggleFlipped());
  controller.bind('flipped', flipped => $('#btn-flip-board').toggleClass('active', flipped));

  $('#btn-clear-board').on('click', event => {
    event.preventDefault();

    const parts = normFen(controller.position).split(/\s/);
    const defaultParts = DEFAULT_FEN.split(/\s/);
    const fen = defaultParts[0] + ' ' + parts[1] + ' - - 0 1';
    controller.push(new Chess(fen));
  });

  $('#btn-swap-colors').on('click', event => {
    event.preventDefault();

    const parts = normFen(controller.position).split(/\s/);

    let fenPart = '';
    for (let i = 0; i < parts[0].length; i++) {
      if (parts[0][i] === parts[0][i].toLowerCase()) {
        fenPart += parts[0][i].toUpperCase();
      } else {
        fenPart += parts[0][i].toLowerCase();
      }
    }
    parts[0] = fenPart;

    parts[2] = '-';
    parts[3] = '-';

    controller.push(new Chess(parts.join(' ')));
  });

  $('#btn-mirror-horizontal').on('click', event => {
    event.preventDefault();

    const parts = normFen(controller.position).split(/\s/);
    const positionParts = parts[0].split(/\//);
    for (let i = 0; i < positionParts.length; i++) {
      positionParts[i] = positionParts[i].split('').reverse().join('');
    }

    const fen = positionParts.join('/') + ' ' + parts[1] + ' - - 0 1';
    controller.push(new Chess(fen));
  });

  $('#btn-mirror-vertical').on('click', event => {
    event.preventDefault();

    const parts = normFen(controller.position).split(/\s/);
    const positionParts = parts[0].split(/\//);
    positionParts.reverse();

    const fen = positionParts.join('/') + ' '+ parts[1] + ' - - 0 1';
    controller.push(new Chess(fen));
  });

  $('#btn-edit').on('click', () => controller.toggleEditMode());

  controller.bind('editMode', editMode => {
    $('#btn-edit').toggleClass('active', editMode);
    $('#btn-edit > span.icon')
      .toggleClass('icon-lock', editMode)
      .toggleClass('icon-lock-open', !editMode);
  });
}


/* Tablebase view */

function TablebaseView(controller, boardView) {
  function bindMoveLink($moveLink) {
    $moveLink
      .on('click', function (event) {
        event.preventDefault();
        const uci = $(this).attr('data-uci');
        const from = uci.substr(0, 2), to = uci.substr(2, 2), promotion = uci[4];
        controller.pushMove(from, to, promotion) || controller.push(new Chess(fen));
        boardView.unsetHovering();
      })
      .on('mouseenter', function () {
        boardView.setHovering($(this).attr('data-uci'));
      })
      .on('mouseleave', () => boardView.unsetHovering());
  }

  bindMoveLink($('a.list-group-item'));

  let abortController;
  controller.bind('positionChanged', (position) => {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const spinner = '<div class="spinner"><div class="double-bounce1"></div><div class="double-bounce2"></div></div>';
    const $content = $('.right-side > .inner').html(spinner);

    const url = new URL('/', location.href);
    url.searchParams.set('fen', normFen(position));
    url.searchParams.set('xhr', 'probe');

    fetch(url.href, {
      signal: abortController.signal
    }).then(res => {
      if (res.ok) return res.text();
      else throw res;
    }).then(html => {
      $content.html(html);
      bindMoveLink($('a.list-group-item'));
    }).catch(err => {
      $content
        .empty()
        .append($('<section>')
        .append($('<h2 id="status"></h2>').text('Network error ' + err.status))
        .append($('<div id="info"></div>').text(err.statusText)));
    }).finally(() => {
      abortController = null;
    });
  });
}


/* Document title */

function DocumentTitle(controller) {
  controller.bind('positionChanged', position => {
    const fen = position.fen().split(/\s/)[0];

    document.title = (
      'K'.repeat(strCount(fen, 'K')) +
      'Q'.repeat(strCount(fen, 'Q')) +
      'R'.repeat(strCount(fen, 'R')) +
      'B'.repeat(strCount(fen, 'B')) +
      'N'.repeat(strCount(fen, 'N')) +
      'P'.repeat(strCount(fen, 'P')) +
      'v' +
      'K'.repeat(strCount(fen, 'k')) +
      'Q'.repeat(strCount(fen, 'q')) +
      'R'.repeat(strCount(fen, 'r')) +
      'B'.repeat(strCount(fen, 'b')) +
      'N'.repeat(strCount(fen, 'n')) +
      'P'.repeat(strCount(fen, 'p')) +
      ' – Syzygy endgame tablebases');
  });
}


/* Initialize */

$(() => {
  const controller = new Controller($('#board').attr('data-fen'));
  const boardView = new BoardView(controller);
  new SideToMoveView(controller);
  new FenInputView(controller);
  new ToolBarView(controller, boardView);

  new DocumentTitle(controller);
  new TablebaseView(controller, boardView);
});
