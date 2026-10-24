// Only mathematical commands may enter the server-side TeX compiler. This is
// deliberately an allowlist: newly imported macros need explicit review.
const commands = new Set(`frac dfrac tfrac cfrac sqrt binom dbinom tbinom
left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr
alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega
Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim limsup liminf max min sup inf det gcd mod pmod bmod
sum prod coprod int iint iiint oint limits nolimits
in notin ni subset subseteq supset supseteq subsetneq supsetneq cup cap bigcup bigcap emptyset varnothing complement
times cdot cdots ldots vdots ddots div pm mp circ bullet ast star odot otimes oplus
le leq leqslant ge geq geqslant ne neq approx sim simeq cong equiv propto ll gg
to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow iff implies nRightarrow
uparrow downarrow nearrow searrow longrightarrow longleftarrow Longrightarrow Longleftrightarrow
forall exists nexists neg land lor wedge vee because therefore not
infty partial nabla angle triangle blacktriangle parallel nparallel perp prime degree
langle rangle lceil rceil lfloor rfloor lvert rvert lVert rVert vert Vert mid lbrace rbrace
overline underline bar hat widehat tilde widetilde vec overrightarrow overleftarrow overbrace underbrace overset underset stackrel frown
text textrm textbf textit textnormal textbackslash mathrm mathbf mathbb mathcal mathsf mathtt mathit mathnormal boldsymbol bm operatorname
displaystyle textstyle scriptstyle scriptscriptstyle quad qquad enspace thinspace medspace thickspace hline begin end`.split(/\s+/));
const environments = new Set(["array", "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "cases", "aligned", "alignedat", "gathered", "smallmatrix"]);

export function assertMathTexSafe(value: string): void {
  const invalid = () => { throw new Error("公式包含非数学 TeX 命令或不完整的分组，请核对"); };
  if (/\^\^|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid();
  let depth = 0;
  const stack: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\") {
      const command = /^[A-Za-z]+/.exec(value.slice(i + 1))?.[0];
      if (!command) {
        if (!"\\{}%$#_& ,;:!|/".includes(value[i + 1] ?? "\0")) invalid();
        i++;
        continue;
      }
      if (!commands.has(command)) invalid();
      i += command.length;
      if (command === "begin" || command === "end") {
        const env = /^\s*\{([A-Za-z]+)\}/.exec(value.slice(i + 1));
        if (!env || !environments.has(env[1])) invalid();
        if (command === "begin") stack.push(env![1]);
        else if (stack.pop() !== env![1]) invalid();
      }
    } else if (c === "{") depth++;
    else if (c === "}" && --depth < 0) invalid();
    else if (c === "%" || c === "#" || c === "$") invalid();
  }
  if (depth || stack.length) invalid();
}
