const stepper = document.getElementById('stepper');
const canvas = document.getElementById('display');
const ctx = canvas.getContext('2d');

const particles = [];

/* Simulation Constants */
const timestep = 1/30;
const solverIterations = 10;
const restDensity = 100;
const baseParticleDensity = 1;
const h = 1;
const epsilon = 300;

/* Physical constraints and constants */
const gravity = 9.81;
const bounds = [1.0, 1.0]; //The fluid is bounded in a 1m^2 box

const initialiseParticles = () => {
    for(let i = 2; i < 200; i++){
        particles.push(
            {
                pos: [Math.random(), Math.random()],
                vel: [0, 0],
                newPos: [0, 0],
            }
        )
    }
};

/* Use naive O(n) method for now.
   Returns a list of indcies for the neighbours of the particles at index. 
*/
const findNeighbours = (index) => {
    const pos = particles[index].pos;
    const results = [];

    for(let i = 0; i < particles.length; i++){
        /* Calculate eulerian distance */
        if(index === i){
            continue;
        }
        const neighbourPos = particles[i].pos;
        const dist = (pos[0] - neighbourPos[0]) * (pos[0] -neighbourPos[0]) + (pos[1] -neighbourPos[1]) * (pos[1] -neighbourPos[1]);
        if(dist < h){
            results.push(i);
        }
    }
    return results;
};

/* Returns the scaling coefficient for the Poly6 Kernel's 
 * (still need to provide unit vector) */
const poly6Kernel = (p1, p2) => {
    const pos1 = particles[p1].newPos;
    const pos2 = particles[p2].newPos;

    const r = Math.sqrt(
        Math.pow(pos1[0] - pos2[0], 2) +
        Math.pow(pos1[1] - pos2[1], 2)
    );

    return (315 / 
        (64 * Math.PI * Math.pow(h, 9)) *
        Math.pow(h*h - r*r, 3)
    );
}

/* Returns the scaling coefficient for the Spiky Kernel's gradient
 * (still need to provide unit vector) */
const spikyKernelGradient = (p1, p2) => {
    console.assert(p1 !== p2, "Spiky Kernel Gradient passed identical parameters!");

    const pos1 = particles[p1].newPos;
    const pos2 = particles[p2].newPos;

    const r = Math.sqrt(Math.abs(Math.pow(pos1[0] - pos2[0], 2) + Math.pow(pos1[1] - pos2[1], 2)));

    //console.assert(r > 0, "Spiky Kernel Gradient radius is 0!  Numerical error?");

    scale = -45 / (Math.PI * Math.pow(h, 6)) * Math.pow(h - r, 2) * 1/r;

    /* Adjust by particle mass (density, rho_0) */
    const dx = scale * (pos2[0] - pos1[0]);
    const dy = scale * (pos2[1] - pos1[1]);

    console.assert(isFinite(dx) && isFinite(dy), "Undefined value passed into Spiky Kernel Gradient!");

    return [
        dx,
        dy
    ];
}

/* Returns the Norm of constaint function C1 with respect to particle P2 */
const spikyConstraintNorm = (p1, p2) => {
    let accumulator = [0, 0];

    /* Sum over neighbours if p1=p2 */
    if(p1 === p2){
        const neighbours = particles[p1].neighbours;
        console.assert(neighbours.length > 0, "Particle has no neighbours!");
        for(let i = 0; i < neighbours.length; i++) {
            const gradient = spikyKernelGradient(p1, neighbours[i]);
            accumulator[0] += gradient[0];
            accumulator[1] += gradient[1];
        }
    } else {
        /* Else just return the gradient with respect to p2 */
        const gradient = spikyKernelGradient(p1, p2);
        accumulator[0] += gradient[0];
        accumulator[1] += gradient[1];

    }
    
    const result = accumulator[0] * accumulator[0] + accumulator[1] * accumulator[1];
    
    console.assert(isFinite(result), "Norm is not defined!");
    //console.assert(result !== 0, "Norm is zero!");

    return result *1 / restDensity;
}

const simulate = () => {
    for(let i = 0; i < particles.length; i++){
        /* Apply Forces to Particle, Just Gravity for Now */
        particles[i].vel[1] += timestep * gravity;

        /* Set estimate of particle update position */
        particles[i].newPos[0] = particles[i].pos[0] + timestep * particles[i].vel[0];
        particles[i].newPos[1] = particles[i].pos[1] + timestep * particles[i].vel[1];
    }

    /* Find all neighbours of each particle*/
    for(let i = 0; i < particles.length; i++){
        particles[i].neighbours = findNeighbours(i);
    }

    /* Apply incompressibility solver to each particle*/
    for(let i = 0; i < solverIterations; i++){

        /* Calculate lambda (scaling constant along gradient of constraint) for each particle*/
        const lambda = new Array(particles.length);
        for(let j = 0; j < particles.length; j++){
            const particle = particles[j];
            const neighbours = particle.neighbours;

            let norm = 0;
            let density = 0;

            /* Sum over particles to get density */
            for(let q = 0; q < neighbours.length; q++){
                density += baseParticleDensity * poly6Kernel(j, neighbours[q]);
                norm += spikyConstraintNorm(j, neighbours[q]);
            }

            console.assert(isFinite(density), "Particle density is not defined");
            //console.log(density);
            const C = density / restDensity - 1;

            lambda[j] = -C / (norm + 300);

            //console.log(lambda[j]);

            console.assert(isFinite(C / (norm + 300)), 'lambda value is not finite');
        }
        //console.log(lambda);

        for(let j = 0; j < particles.length; j++){
            const particle = particles[j];
            const neighbours = particle.neighbours;

            let dp = [0, 0];
            /* Sum over neighbours corrections */
            for(let q = 0; q < neighbours.length; q++){
                const scale = (lambda[j] + lambda[neighbours[q]]) / restDensity;
                const deltaW = spikyKernelGradient(j, neighbours[q]);
                dp[0] += deltaW[0] * scale;
                dp[1] += deltaW[1] * scale;
            }

            /* Apply the correction */
            particle.newPos[0] += dp[0];
            particle.newPos[1] += dp[1];

            console.assert(isFinite(dp[0]) && isFinite(dp[1]), 'Position update is not finite');
            
            /* We are lazy for the 2d demo so just clamp the particles 
             * to the edge of the box */
            if(particle.newPos[0] > bounds[0]){
                particle.newPos[0] = bounds[0];
            }
            if(particle.newPos[0] < -bounds[0]){
                particle.newPos[0] = -bounds[0];
            }
            if(particle.newPos[1] > bounds[1]){
                particle.newPos[1] = bounds[1];
            }
            if(particle.newPos[1] < -bounds[1]){
                particle.newPos[1] = -bounds[1];
            }
        }
    }

    /* Apply position update and update velocity with Verlet integration */
    for(let i = 0; i < particles.length; i++){
        /* Apply correction to velocity */
        const particle = particles[i];
        particle.vel[0] += 1/timestep * (particle.newPos[0] - particle.pos[0]);
        particle.vel[1] += 1/timestep * (particle.newPos[1] - particle.pos[1]);

        particle.pos = particle.newPos;
    }
};

const render = () => {
    ctx.clearRect(0, 0, 500, 500);
    for(let i = 0; i < particles.length; i++){
        const particle = particles[i];
        ctx.beginPath();
        ctx.arc(particle.pos[0] * 500, particle.pos[1] * 500 , 10, 0, 2*Math.PI);
        ctx.stroke();
    }
    //console.log(particles);
}

stepper.onclick = () => {
    simulate();
    render();
}

/* Initial render*/
initialiseParticles();
render();