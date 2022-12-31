import { Accordion, ScrollArea, SimpleGrid, Stack, Tabs } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useForceUpdate, useHotkeys, useLocalStorage } from "@mantine/hooks";
import { IconInfoCircle, IconNotes, IconZoomCheck } from "@tabler/icons";
import { Chess, DEFAULT_POSITION, Square, validateFen } from "chess.js";
import { createContext, useEffect, useMemo, useState } from "react";
import { movesToVariationTree, VariationTree } from "../utils/chess";
import { Game, Outcome, Speed } from "../utils/db";
import { Engine } from "../utils/engines";
import AnnotationPanel from "./AnnotationPanel";
import BestMoves from "./BestMoves";
import Chessboard from "./Chessboard";
import EngineSettingsBoard from "./EngineSettingsBoard";
import FenInput from "./FenInput";
import GameInfo from "./GameInfo";
import GameNotation from "./GameNotation";
import MoveControls from "./MoveControls";
import PgnInput from "./PgnInput";

export const TreeContext = createContext(
  new VariationTree(null, DEFAULT_POSITION, null)
);

function BoardAnalysis({ loadGame }: { loadGame?: boolean }) {
  const game: Game = useMemo(() => {
    if (loadGame && sessionStorage.getItem("game")) {
      return JSON.parse(sessionStorage.getItem("game")!);
    } else {
      return {
        white: {
          id: -1,
          name: "White",
        },
        black: {
          id: -1,
          name: "Black",
        },
        speed: Speed.Unknown,
        outcome: Outcome.Unknown,
        moves: "",
        date: "??.??.??",
        site: "",
      };
    }
  }, [loadGame]);

  const forceUpdate = useForceUpdate();
  const [selectedEngines, setSelectedEngines] = useLocalStorage<Engine[]>({
    key: "selected-engines",
    defaultValue: [],
  });
  const form = useForm({
    initialValues: {
      fen: DEFAULT_POSITION,
    },
    validate: {
      fen: (value) => {
        const v = validateFen(value);
        if (v.valid) {
          return null;
        } else {
          return v.error;
        }
      },
    },
  });

  const initial_tree = useMemo(() => {
    const tree = movesToVariationTree(game.moves);
    return tree;
  }, [game.moves]);

  // Variation tree of all the previous moves
  const [tree, setTree] = useState<VariationTree>(initial_tree);
  const [arrows, setArrows] = useState<string[]>([]);
  const chess = new Chess(tree.fen);

  function makeMove(move: { from: Square; to: Square; promotion?: string }) {
    const newMove = chess.move(move);
    const newTree = new VariationTree(tree, chess.fen(), newMove);
    if (tree.children.length === 0) {
      tree.children = [newTree];
    } else if (tree.children.every((child) => child.fen !== chess.fen())) {
      tree.children.push(newTree);
    }
    setTree(newTree);
  }

  function makeMoves(moves: string[]) {
    let parentTree = tree;
    let newTree = tree;
    moves.forEach((move) => {
      const newMove = chess.move(move, { sloppy: true });
      newTree = new VariationTree(parentTree, chess.fen(), newMove);
      if (parentTree.children.length === 0) {
        parentTree.children = [newTree];
        parentTree = newTree;
      } else if (
        parentTree.children.every((child) => child.fen !== newTree.fen)
      ) {
        parentTree.children.push(newTree);
        parentTree = newTree;
      } else {
        parentTree = parentTree.children.find(
          (child) => child.fen === newTree.fen
        )!;
      }
    });
    setTree(newTree);
  }

  function undoMove() {
    if (tree.parent) {
      setTree(tree.parent);
    }
  }

  function redoMove() {
    if (tree.children.length > 0) {
      setTree(tree.children[0]);
    }
  }

  function goToStart() {
    setTree(tree.getTopVariation());
  }

  function goToEnd() {
    setTree(tree.getBottomVariation());
  }

  function resetToFen(fen: string) {
    setTree(new VariationTree(null, fen, null));
  }

  useHotkeys([
    ["ArrowLeft", () => undoMove()],
    ["ArrowRight", () => redoMove()],
    ["ArrowUp", () => goToStart()],
    ["ArrowDown", () => goToEnd()],
  ]);

  useEffect(() => {
    setArrows([]);
  }, [tree.fen]);

  return (
    <TreeContext.Provider value={tree}>
      <SimpleGrid cols={2} breakpoints={[{ maxWidth: 800, cols: 1 }]}>
        <Chessboard makeMove={makeMove} arrows={arrows} />
        <Stack>
          <Tabs defaultValue="analysis">
            <Tabs.List grow>
              <Tabs.Tab value="analysis" icon={<IconZoomCheck size={16} />}>
                Analysis
              </Tabs.Tab>
              <Tabs.Tab value="annotate" icon={<IconNotes size={16} />}>
                Annotate
              </Tabs.Tab>
              <Tabs.Tab value="info" icon={<IconInfoCircle size={16} />}>
                Info
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="info" pt="xs">
              <Stack>
                <GameInfo
                  player1={game.white}
                  player2={game.black}
                  date={game.date}
                  outcome={game.outcome}
                />
                <FenInput form={form} onSubmit={resetToFen} />
                <PgnInput />
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="annotate" pt="xs">
              <AnnotationPanel forceUpdate={forceUpdate} setTree={setTree} />
            </Tabs.Panel>
            <Tabs.Panel value="analysis" pt="xs">
              <ScrollArea
                style={{ height: "40vh" }}
                offsetScrollbars
                type="always"
              >
                <Stack>
                  <Accordion variant="separated" multiple chevronSize={0}>
                    {selectedEngines.map((engine, i) => {
                      return (
                        <Accordion.Item value={engine.path}>
                          <BestMoves
                            id={i}
                            key={engine.name}
                            engine={engine}
                            makeMoves={makeMoves}
                            setArrows={setArrows}
                          />
                        </Accordion.Item>
                      );
                    })}
                  </Accordion>
                  <EngineSettingsBoard
                    selectedEngines={selectedEngines}
                    setSelectedEngines={setSelectedEngines}
                  />
                </Stack>
              </ScrollArea>
            </Tabs.Panel>
          </Tabs>
          <GameNotation setTree={setTree} />
          <MoveControls
            goToStart={goToStart}
            goToEnd={goToEnd}
            redoMove={redoMove}
            undoMove={undoMove}
          />
        </Stack>
      </SimpleGrid>
    </TreeContext.Provider>
  );
}

export default BoardAnalysis;
